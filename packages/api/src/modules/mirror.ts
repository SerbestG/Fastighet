import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { audit } from '../core/audit.js';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { badRequest, notFound } from '../core/errors.js';
import { extractMain, sanitiseHtml } from '../core/sanitise.js';
import { parse } from '../core/validate.js';

/**
 * Spegling av innehåll från beställarens webbplats (krav B.1.26).
 *
 * Handläggaren pekar ut en sida, tjänsten hämtar den, rensar bort allt som inte
 * är text och länkar, och visar resultatet för granskning. Först därefter går
 * det att publicera. Adressen måste ligga på bolagets egen webbplats, så att
 * funktionen inte går att använda för att hämta godtyckliga adresser.
 */

const pageSchema = z.object({
  title: z.string().trim().min(2).max(120),
  sourceUrl: z.string().trim().url().max(500),
  section: z.enum(['info', 'area', 'moving', 'support']).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  refreshIntervalMinutes: z.number().int().min(60).max(43_200).optional(),
});

/**
 * Kontrollerar att adressen hör till bolagets webbplats.
 *
 * Utan den här kontrollen skulle funktionen kunna användas för att få servern
 * att hämta interna adresser åt någon annan.
 */
export async function assertOwnWebsite(
  client: pg.PoolClient,
  sourceUrl: string,
): Promise<URL> {
  const org = await client.query<{ website_url: string | null }>(
    'select website_url from organisations limit 1',
  );
  const website = org.rows[0]?.website_url;
  if (!website) {
    throw badRequest('Bolagets webbplats är inte registrerad, så inget kan speglas.');
  }

  let target: URL;
  let allowed: URL;
  try {
    target = new URL(sourceUrl);
    allowed = new URL(website);
  } catch {
    throw badRequest('Adressen går inte att tolka.');
  }

  if (target.protocol !== 'https:') {
    throw badRequest('Endast adresser över https kan speglas.');
  }
  // Samma värd, eller en underdomän till bolagets webbplats.
  const sameHost =
    target.hostname === allowed.hostname || target.hostname.endsWith(`.${allowed.hostname}`);
  if (!sameHost) {
    throw badRequest(`Adressen måste ligga på ${allowed.hostname}.`);
  }
  return target;
}

/** Hämtar och rensar en sida. Kastar med ett begripligt fel vid problem. */
export async function fetchAndSanitise(url: URL): Promise<{ html: string; removed: string[] }> {
  const response = await fetch(url, {
    headers: { accept: 'text/html', 'user-agent': 'Hemvist innehållsspegling' },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw badRequest(`Sidan svarade ${response.status}.`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/html')) {
    throw badRequest('Adressen är ingen webbsida.');
  }

  const body = await response.text();
  const result = sanitiseHtml(extractMain(body), { baseUrl: url.toString() });
  if (!result.html) {
    throw badRequest('Sidan innehöll ingen text som gick att spegla.');
  }
  return result;
}

export async function registerMirrorRoutes(app: FastifyInstance): Promise<void> {
  /* ---------------------------------------------------------- personal --- */

  app.get('/api/staff/mirrored-pages', async (request) => {
    requirePermission(request, 'notice:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select id, title, source_url, section, sort_order, status, removed_tags,
                last_fetch_at, last_success_at, last_error, refresh_interval_minutes,
                content_html is not null as has_content
           from mirrored_pages order by section, sort_order, title`,
      );
      return { pages: result.rows };
    });
  });

  app.post('/api/staff/mirrored-pages', async (request, reply) => {
    const auth = requirePermission(request, 'notice:write');
    const input = parse(pageSchema, request.body);

    const created = await db(request, async (client) => {
      const url = await assertOwnWebsite(client, input.sourceUrl);
      const content = await fetchAndSanitise(url);

      const result = await client.query<{ id: string }>(
        `insert into mirrored_pages
           (org_id, title, source_url, section, sort_order, refresh_interval_minutes,
            content_html, removed_tags, status, last_fetch_at, last_success_at, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'draft', now(), now(), $9)
         returning id`,
        [
          auth.orgId,
          input.title,
          url.toString(),
          input.section ?? 'info',
          input.sortOrder ?? 100,
          input.refreshIntervalMinutes ?? 1440,
          content.html,
          content.removed,
          auth.userId,
        ],
      );
      return result.rows[0]!.id;
    });

    await audit(request, {
      action: 'mirror.page.created',
      entityType: 'mirrored_page',
      entityId: created,
      detail: { sourceUrl: input.sourceUrl },
    });
    return reply.status(201).send({ id: created });
  });

  /** Förhandsgranskning av den rensade texten, innan publicering. */
  app.get<{ Params: { id: string } }>('/api/staff/mirrored-pages/:id', async (request) => {
    requirePermission(request, 'notice:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select id, title, source_url, section, status, content_html, removed_tags,
                last_success_at, last_error
           from mirrored_pages where id = $1`,
        [request.params.id],
      );
      const page = result.rows[0];
      if (!page) throw notFound('Sidan hittades inte.');
      return { page };
    });
  });

  /** Hämtar om sidan nu, till exempel efter en ändring på webbplatsen. */
  app.post<{ Params: { id: string } }>('/api/staff/mirrored-pages/:id/refresh', async (request) => {
    requirePermission(request, 'notice:write');
    return db(request, async (client) => {
      const found = await client.query<{ source_url: string }>(
        'select source_url from mirrored_pages where id = $1',
        [request.params.id],
      );
      if (!found.rowCount) throw notFound('Sidan hittades inte.');

      const url = await assertOwnWebsite(client, found.rows[0]!.source_url);
      try {
        const content = await fetchAndSanitise(url);
        await client.query(
          `update mirrored_pages
              set content_html = $2, removed_tags = $3, last_fetch_at = now(),
                  last_success_at = now(), last_error = null,
                  status = case when status = 'error' then 'draft' else status end,
                  updated_at = now()
            where id = $1`,
          [request.params.id, content.html, content.removed],
        );
        return { ok: true, removed: content.removed };
      } catch (error) {
        // Ett hämtningsfel får inte tömma innehållet som redan visas.
        await client.query(
          `update mirrored_pages
              set last_fetch_at = now(), last_error = $2, status = 'error', updated_at = now()
            where id = $1`,
          [request.params.id, (error as Error).message.slice(0, 300)],
        );
        throw error;
      }
    });
  });

  app.patch<{ Params: { id: string }; Body: { status?: 'draft' | 'published'; title?: string; sortOrder?: number } }>(
    '/api/staff/mirrored-pages/:id',
    async (request) => {
      requirePermission(request, 'notice:write');
      const { status, title, sortOrder } = request.body ?? {};

      await db(request, async (client) => {
        if (status === 'published') {
          const ready = await client.query<{ has_content: boolean }>(
            'select content_html is not null as has_content from mirrored_pages where id = $1',
            [request.params.id],
          );
          if (!ready.rowCount) throw notFound('Sidan hittades inte.');
          // En sida utan hämtat innehåll kan inte publiceras.
          if (!ready.rows[0]!.has_content) {
            throw badRequest('Sidan har inget hämtat innehåll att visa.');
          }
        }
        const result = await client.query(
          `update mirrored_pages
              set status = coalesce($2, status),
                  title = coalesce($3, title),
                  sort_order = coalesce($4, sort_order),
                  updated_at = now()
            where id = $1`,
          [request.params.id, status ?? null, title ?? null, sortOrder ?? null],
        );
        if (!result.rowCount) throw notFound('Sidan hittades inte.');
      });

      await audit(request, {
        action: status === 'published' ? 'mirror.page.published' : 'mirror.page.updated',
        entityType: 'mirrored_page',
        entityId: request.params.id,
      });
      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string } }>('/api/staff/mirrored-pages/:id', async (request) => {
    requirePermission(request, 'notice:write');
    await db(request, async (client) => {
      await client.query('delete from mirrored_pages where id = $1', [request.params.id]);
    });
    await audit(request, {
      action: 'mirror.page.removed',
      entityType: 'mirrored_page',
      entityId: request.params.id,
    });
    return { ok: true };
  });

  /* -------------------------------------------------------- hyresgäst --- */

  app.get<{ Querystring: { section?: string } }>('/api/pages', async (request) => {
    requireAuth(request);
    return db(request, async (client) => {
      const section = request.query.section ?? null;
      const result = await client.query(
        `select id, title, section, content_html, source_url, last_success_at
           from mirrored_pages
          where status = 'published' and ($1::text is null or section = $1)
          order by sort_order, title`,
        [section],
      );
      return { pages: result.rows };
    });
  });
}
