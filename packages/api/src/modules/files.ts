import type { FastifyInstance } from 'fastify';
import { audit } from '../core/audit.js';
import { db, requireAuth } from '../core/context.js';
import { badRequest, forbidden, notFound } from '../core/errors.js';
import { readStoredFile, storeFile } from '../core/files.js';
import { config } from '../config.js';

/**
 * Uppladdning och hämtning av filer.
 *
 * Hämtning går alltid via API:et så att behörigheten kan kontrolleras vid varje
 * nedladdning – en filreferens ensam ger ingen åtkomst (krav C.5.6, C.3.14).
 */
export async function registerFileRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/files', async (request) => {
    const auth = requireAuth(request);
    const parts = request.files();
    const stored: {
      id: string;
      originalName: string;
      mimeType: string;
      sizeBytes: number;
      scanStatus: 'clean' | 'pending';
    }[] = [];

    for await (const part of parts) {
      const buffer = await part.toBuffer();
      const file = await db(request, (client) =>
        storeFile(client, {
          orgId: auth.orgId,
          uploadedBy: auth.userId,
          buffer,
          mimeType: part.mimetype,
          originalName: part.filename,
        }),
      );
      stored.push({
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        scanStatus: file.scanStatus,
      });
    }

    if (stored.length === 0) throw badRequest('Ingen fil togs emot.');

    // En fil som inte kunnat granskas ligger i karantän och går varken att
    // koppla till ett ärende eller att hämta. Klienten får veta det direkt.
    const quarantined = stored.filter((file) => file.scanStatus !== 'clean');
    await audit(request, {
      action: 'file.uploaded',
      detail: { count: stored.length, quarantined: quarantined.length },
    });
    return {
      files: stored,
      quarantined: quarantined.length,
      message:
        quarantined.length > 0
          ? 'En eller flera filer väntar på säkerhetsgranskning och kan inte användas ännu.'
          : null,
    };
  });

  app.get<{ Params: { id: string } }>('/api/files/:id', async (request, reply) => {
    const auth = requireAuth(request);
    const file = await db(request, async (client) => {
      const result = await client.query<{
        id: string;
        storage_key: string;
        original_name: string;
        mime_type: string;
        size_bytes: number;
        uploaded_by: string | null;
        scan_status: string;
      }>(
        `select id, storage_key, original_name, mime_type, size_bytes, uploaded_by, scan_status
           from files where id = $1`,
        [request.params.id],
      );
      const row = result.rows[0];
      if (!row) throw notFound('Filen hittades inte.');
      if (row.scan_status !== 'clean') throw forbidden('Filen är inte godkänd för nedladdning.');

      // Personal och entreprenörer med ärendebehörighet når bilagor i sina ärenden.
      // En hyresgäst når bara filer som hör till det egna boendet.
      const allowed = await isFileVisible(client, auth, row.id, row.uploaded_by);
      if (!allowed) throw notFound('Filen hittades inte.');
      return row;
    });

    const buffer = await readStoredFile(file.storage_key);
    reply
      .header('content-type', file.mime_type)
      // Filer visas eller laddas ned, men körs aldrig som innehåll från vår domän.
      .header('content-disposition', `attachment; filename="${encodeURIComponent(file.original_name)}"`)
      .header('x-content-type-options', 'nosniff')
      .header('cache-control', 'private, no-store');
    return reply.send(buffer);
  });

  app.get('/api/files/limits', async () => ({
    maxFileBytes: config.storage.maxFileBytes,
    maxFilesPerRequest: config.storage.maxFilesPerRequest,
    allowedMimeTypes: config.storage.allowedMimeTypes,
  }));
}

async function isFileVisible(
  client: import('pg').PoolClient,
  auth: import('../core/context.js').AuthContext,
  fileId: string,
  uploadedBy: string | null,
): Promise<boolean> {
  if (uploadedBy === auth.userId) return true;

  if (auth.surface === 'staff') {
    if (auth.permissions.has('case:read') || auth.permissions.has('document:read')) return true;
    return false;
  }

  if (auth.surface === 'contractor') {
    const result = await client.query(
      `select 1 from case_attachments ca
         join work_orders w on w.case_id = ca.case_id
        where ca.file_id = $1 and w.contractor_org_id = $2`,
      [fileId, auth.contractorOrgId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  // Hyresgäst: bilaga i eget ärende, dokument för egen bostad, bild i en
  // publicering som riktats till boendet, eller organisationens logotyp.
  const result = await client.query<{ visible: boolean }>(
    `select exists (
        select 1 from case_attachments ca join cases c on c.id = ca.case_id
         where ca.file_id = $1 and (c.tenancy_id = any($2::uuid[]) or c.reporter_user_id = $3)
      ) or exists (
        select 1 from documents d
         where d.file_id = $1 and d.visible_to_resident
           and (d.tenancy_id = any($2::uuid[])
                or d.unit_id in (select unit_id from tenancies where id = any($2::uuid[])))
      ) or exists (
        select 1 from invoices i where i.file_id = $1 and i.tenancy_id = any($2::uuid[])
      ) or exists (
        select 1 from units u where u.floor_plan_file_id = $1
          and u.id in (select unit_id from tenancies where id = any($2::uuid[]))
      ) or exists (
        select 1 from notices n where n.image_file_id = $1 and n.status = 'published'
      ) or exists (
        select 1 from organisations o where o.logo_file_id = $1
      ) as visible`,
    [fileId, auth.tenancyIds, auth.userId],
  );
  return result.rows[0]?.visible ?? false;
}
