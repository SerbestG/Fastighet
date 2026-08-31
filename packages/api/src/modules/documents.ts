import type { FastifyInstance } from 'fastify';
import { createDocumentSchema, createInvoiceSchema } from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { badRequest, notFound } from '../core/errors.js';
import { parse } from '../core/validate.js';

/**
 * Dokument och hyresavier.
 *
 * Betalning sker via bankgiro. Så länge det saknas en betalintegration visar
 * appen betalningsuppgifterna men påstår aldrig att betalning kan genomföras i
 * appen (avsnitt 12 i kravbilden).
 */
export async function registerDocumentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/documents', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:document:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select d.id, d.kind, d.title, d.document_date, d.requires_signature, d.signed_at,
                d.created_at, f.original_name, f.mime_type, f.size_bytes, f.id as file_id,
                uh.object_number
           from documents d
           join files f on f.id = d.file_id
           left join tenancies t on t.id = d.tenancy_id
           left join unit_hierarchy uh on uh.unit_id = coalesce(t.unit_id, d.unit_id)
          where d.visible_to_resident
            and (d.tenancy_id = any($1::uuid[])
                 or d.unit_id in (select unit_id from tenancies where id = any($1::uuid[]))
                 or (d.tenancy_id is null and d.unit_id is null and d.property_id in (
                       select uh2.property_id from tenancies t2
                        join unit_hierarchy uh2 on uh2.unit_id = t2.unit_id
                       where t2.id = any($1::uuid[]))))
          order by coalesce(d.document_date, d.created_at::date) desc`,
        [auth.tenancyIds],
      );

      // Planlösningen hör till objektet och listas tillsammans med dokumenten
      // (krav A.1.19, B.1.12).
      const floorPlans = await client.query(
        `select u.floor_plan_file_id as file_id, f.original_name, f.mime_type, f.size_bytes,
                uh.object_number
           from tenancies t
           join units u on u.id = t.unit_id
           join unit_hierarchy uh on uh.unit_id = u.id
           join files f on f.id = u.floor_plan_file_id
          where t.id = any($1::uuid[]) and u.floor_plan_file_id is not null`,
        [auth.tenancyIds],
      );

      return { documents: result.rows, floorPlans: floorPlans.rows };
    });
  });

  app.get('/api/invoices', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:invoice:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select i.id, i.invoice_number, i.ocr, i.bankgiro, i.period_start, i.period_end,
                i.due_date, i.amount_ore, i.status, i.paid_at, i.file_id, i.synced_at,
                uh.object_number, uh.property_street,
                (i.status = 'open' and i.due_date < current_date) as is_overdue
           from invoices i
           join tenancies t on t.id = i.tenancy_id
           join unit_hierarchy uh on uh.unit_id = t.unit_id
          where i.tenancy_id = any($1::uuid[])
          order by i.due_date desc limit 60`,
        [auth.tenancyIds],
      );

      // Betalning i appen kräver en ansluten betalintegration. Utan den visar
      // appen bara betalningsuppgifterna.
      const payment = await client.query<{ status: string }>(
        "select status from integrations where kind = 'payments' order by updated_at desc limit 1",
      );
      const paymentStatus = payment.rows[0]?.status ?? 'planned';

      return {
        invoices: result.rows,
        payment: {
          inAppPaymentAvailable: paymentStatus === 'connected',
          reason:
            paymentStatus === 'connected'
              ? null
              : 'Betalning i appen är inte aktiverad. Betala med bankgiro och OCR-nummer.',
        },
      };
    });
  });

  app.get<{ Params: { id: string } }>('/api/invoices/:id', async (request) => {
    const auth = requireAuth(request);
    requirePermission(request, 'self:invoice:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select i.*, uh.object_number, uh.property_street, uh.property_city
           from invoices i
           join tenancies t on t.id = i.tenancy_id
           join unit_hierarchy uh on uh.unit_id = t.unit_id
          where i.id = $1 and i.tenancy_id = any($2::uuid[])`,
        [request.params.id, auth.tenancyIds],
      );
      const invoice = result.rows[0];
      if (!invoice) throw notFound('Avin hittades inte.');
      const payments = await client.query(
        'select amount_ore, paid_at, source from payments where invoice_id = $1 order by paid_at',
        [invoice.id],
      );
      return { invoice, payments: payments.rows };
    });
  });

  /* ------------------------------------------------- administration --- */

  app.get<{ Querystring: { tenancyId?: string; kind?: string } }>(
    '/api/staff/documents',
    async (request) => {
      requirePermission(request, 'document:read');
      return db(request, async (client) => {
        const params: unknown[] = [];
        const where: string[] = ['true'];
        if (request.query.tenancyId) {
          params.push(request.query.tenancyId);
          where.push(`d.tenancy_id = $${params.length}`);
        }
        if (request.query.kind) {
          params.push(request.query.kind);
          where.push(`d.kind = $${params.length}`);
        }
        const result = await client.query(
          `select d.id, d.kind, d.title, d.document_date, d.visible_to_resident,
                  d.requires_signature, d.signed_at, d.created_at, d.tenancy_id,
                  f.original_name, f.mime_type, f.size_bytes, f.id as file_id,
                  uh.object_number, uh.property_name
             from documents d
             join files f on f.id = d.file_id
             left join tenancies t on t.id = d.tenancy_id
             left join unit_hierarchy uh on uh.unit_id = coalesce(t.unit_id, d.unit_id)
            where ${where.join(' and ')}
            order by d.created_at desc limit 200`,
          params,
        );
        return { documents: result.rows };
      });
    },
  );

  app.post('/api/staff/documents', async (request) => {
    const auth = requirePermission(request, 'document:write');
    const input = parse(createDocumentSchema, request.body);
    return db(request, async (client) => {
      const file = await client.query("select 1 from files where id = $1 and scan_status = 'clean'", [
        input.fileId,
      ]);
      if (!file.rowCount) throw badRequest('Filen hittades inte eller är inte godkänd.');

      const result = await client.query<{ id: string }>(
        `insert into documents (org_id, file_id, kind, title, document_date, tenancy_id, unit_id,
                                property_id, visible_to_resident, requires_signature, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`,
        [
          auth.orgId,
          input.fileId,
          input.kind,
          input.title,
          input.documentDate ?? null,
          input.tenancyId ?? null,
          input.unitId ?? null,
          input.propertyId ?? null,
          input.visibleToResident,
          input.requiresSignature,
          auth.userId,
        ],
      );
      await audit(request, {
        action: 'document.created',
        entityType: 'document',
        entityId: result.rows[0]!.id,
        detail: { kind: input.kind, visibleToResident: input.visibleToResident },
      });
      return { id: result.rows[0]!.id };
    });
  });

  app.get<{ Querystring: { status?: string; tenancyId?: string } }>(
    '/api/staff/invoices',
    async (request) => {
      requirePermission(request, 'invoice:read');
      return db(request, async (client) => {
        const params: unknown[] = [];
        const where: string[] = ['true'];
        if (request.query.status) {
          params.push(request.query.status);
          where.push(`i.status = $${params.length}`);
        }
        if (request.query.tenancyId) {
          params.push(request.query.tenancyId);
          where.push(`i.tenancy_id = $${params.length}`);
        }
        const result = await client.query(
          `select i.id, i.invoice_number, i.ocr, i.period_start, i.period_end, i.due_date,
                  i.amount_ore, i.status, i.paid_at, i.synced_at,
                  uh.object_number, uh.property_name,
                  u.first_name, u.last_name
             from invoices i
             join tenancies t on t.id = i.tenancy_id
             join unit_hierarchy uh on uh.unit_id = t.unit_id
             left join tenancy_residents tr on tr.tenancy_id = t.id and tr.is_primary
             left join users u on u.id = tr.user_id
            where ${where.join(' and ')}
            order by i.due_date desc limit 200`,
          params,
        );
        return { invoices: result.rows };
      });
    },
  );

  app.post('/api/staff/invoices', async (request) => {
    const auth = requirePermission(request, 'invoice:write');
    const input = parse(createInvoiceSchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into invoices (org_id, tenancy_id, invoice_number, ocr, bankgiro, period_start,
                               period_end, due_date, amount_ore, status, file_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (org_id, invoice_number) do update
           set amount_ore = excluded.amount_ore, due_date = excluded.due_date,
               status = excluded.status, synced_at = now()
         returning id`,
        [
          auth.orgId,
          input.tenancyId,
          input.invoiceNumber,
          input.ocr ?? null,
          input.bankgiro ?? null,
          input.periodStart,
          input.periodEnd,
          input.dueDate,
          input.amountOre,
          input.status,
          input.fileId ?? null,
        ],
      );
      await audit(request, { action: 'invoice.upserted', entityType: 'invoice', entityId: result.rows[0]!.id });
      return { id: result.rows[0]!.id };
    });
  });
}
