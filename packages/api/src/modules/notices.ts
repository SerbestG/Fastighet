import type { FastifyInstance } from 'fastify';
import {
  OPERATIONAL_NOTICE_KINDS,
  createNoticeSchema,
  updateNoticeSchema,
  type NoticeKind,
} from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { audienceForUser, countAudience, resolveAudienceUsers } from '../core/audience.js';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { notify } from '../core/notify.js';
import { parse } from '../core/validate.js';

/**
 * Driftinformation och nyheter.
 *
 * En publicering riktas mot en eller flera nivåer i fastighetsstrukturen och når
 * bara boende som omfattas av dem. Ingen hyresgäst kan hämta en publicering som
 * inte gäller den egna adressen – kontrollen görs i frågan, inte i gränssnittet.
 */
export async function registerNoticeRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------------------------- hyresgästens vy --- */

  app.get<{ Querystring: { kind?: string } }>('/api/notices', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query(
        `select n.id, n.kind, n.severity, n.title, n.summary, n.body_html, n.image_file_id,
                n.starts_at, n.expected_end_at, n.next_update_at, n.contact_info, n.status,
                n.pinned_until, n.requires_acknowledgement, n.published_at, n.resolved_at,
                coalesce(tr.title, n.title)         as localized_title,
                coalesce(tr.body_html, n.body_html) as localized_body_html,
                nr.read_at, nr.acknowledged_at,
                (n.pinned_until is not null and n.pinned_until > now()) as pinned
           from notices n
           left join notice_translations tr on tr.notice_id = n.id and tr.locale = $2
           left join notice_reads nr on nr.notice_id = n.id and nr.user_id = $3
          where n.status in ('published','resolved')
            and (n.publish_at is null or n.publish_at <= now())
            and (n.unpublish_at is null or n.unpublish_at > now())
            and ${audienceForUser(1)}
          order by pinned desc,
                   case n.severity when 'critical' then 0 when 'important' then 1 else 2 end,
                   coalesce(n.published_at, n.created_at) desc
          limit 100`,
        [auth.tenancyIds, auth.locale, auth.userId],
      );

      const notices = result.rows.map((row) => ({
        ...row,
        // Driftinformation och nyheter visas i skilda flöden i appen.
        stream: OPERATIONAL_NOTICE_KINDS.includes(row.kind as NoticeKind) ? 'operational' : 'news',
      }));
      return {
        operational: notices.filter((n) => n.stream === 'operational'),
        news: notices.filter((n) => n.stream === 'news'),
      };
    });
  });

  app.get<{ Params: { id: string } }>('/api/notices/:id', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query(
        `select n.*, coalesce(tr.title, n.title) as localized_title,
                coalesce(tr.body_html, n.body_html) as localized_body_html,
                nr.read_at, nr.acknowledged_at
           from notices n
           left join notice_translations tr on tr.notice_id = n.id and tr.locale = $3
           left join notice_reads nr on nr.notice_id = n.id and nr.user_id = $4
          where n.id = $2
            and n.status in ('published','resolved')
            and (n.publish_at is null or n.publish_at <= now())
            and ${audienceForUser(1)}`,
        [auth.tenancyIds, request.params.id, auth.locale, auth.userId],
      );
      const notice = result.rows[0];
      if (!notice) throw notFound('Informationen hittades inte.');

      await client.query(
        `insert into notice_reads (org_id, notice_id, user_id) values ($1,$2,$3)
         on conflict (notice_id, user_id) do nothing`,
        [auth.orgId, notice.id, auth.userId],
      );
      return { notice };
    });
  });

  app.post<{ Params: { id: string } }>('/api/notices/:id/acknowledge', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const exists = await client.query(
        `select 1 from notices n
          where n.id = $2 and n.requires_acknowledgement and ${audienceForUser(1)}`,
        [auth.tenancyIds, request.params.id],
      );
      if (!exists.rowCount) throw notFound('Informationen hittades inte.');
      await client.query(
        `insert into notice_reads (org_id, notice_id, user_id, acknowledged_at)
         values ($1,$2,$3, now())
         on conflict (notice_id, user_id) do update set acknowledged_at = now()`,
        [auth.orgId, request.params.id, auth.userId],
      );
      await audit(request, { action: 'notice.acknowledged', entityType: 'notice', entityId: request.params.id });
      return { acknowledged: true };
    });
  });

  /* ------------------------------------------------- personalens vy --- */

  app.get<{ Querystring: { status?: string; kind?: string; q?: string } }>(
    '/api/staff/notices',
    async (request) => {
      requirePermission(request, 'notice:read');
      return db(request, async (client) => {
        const params: unknown[] = [];
        const where: string[] = ['true'];
        if (request.query.status) {
          params.push(request.query.status);
          where.push(`n.status = $${params.length}`);
        }
        if (request.query.kind) {
          params.push(request.query.kind);
          where.push(`n.kind = $${params.length}`);
        }
        if (request.query.q) {
          params.push(`%${request.query.q}%`);
          where.push(`n.title ilike $${params.length}`);
        }
        const result = await client.query(
          `select n.id, n.kind, n.severity, n.title, n.summary, n.status, n.starts_at,
                  n.expected_end_at, n.publish_at, n.unpublish_at, n.pinned_until, n.channels,
                  n.requires_acknowledgement, n.published_at, n.created_at,
                  u.first_name, u.last_name,
                  (select count(*)::int from notice_reads r where r.notice_id = n.id) as read_count,
                  (select count(*)::int from notice_reads r
                    where r.notice_id = n.id and r.acknowledged_at is not null) as acknowledged_count,
                  coalesce(
                    (select json_agg(json_build_object('scope', a.scope, 'scopeId', a.scope_id))
                       from notice_audiences a where a.notice_id = n.id), '[]'::json) as audience
             from notices n left join users u on u.id = n.created_by
            where ${where.join(' and ')}
            order by coalesce(n.publish_at, n.created_at) desc limit 200`,
          params,
        );
        return { notices: result.rows };
      });
    },
  );

  /** Antal berörda hyresgäster innan publicering, för förhandsgranskning. */
  app.post('/api/staff/notices/preview-audience', async (request) => {
    requirePermission(request, 'notice:read');
    const body = request.body as { audience?: { scope: string; scopeId?: string | null }[] };
    if (!body?.audience?.length) throw badRequest('Välj minst en mottagargrupp.');
    return db(request, async (client) => {
      const counts = await countAudience(client, body.audience as never);
      return counts;
    });
  });

  app.post('/api/staff/notices', async (request) => {
    const auth = requirePermission(request, 'notice:write');
    const input = parse(createNoticeSchema, request.body);

    const publishNow = !input.publishAt;
    const status = publishNow ? 'published' : 'scheduled';
    if (status === 'published' && !auth.permissions.has('notice:publish')) {
      throw badRequest('Du får skapa utkast men inte publicera. Ange en publiceringstid eller be en behörig kollega publicera.');
    }

    return db(request, async (client) => {
      const result = await client.query<{ id: string }>(
        `insert into notices (org_id, kind, severity, title, body_html, summary, image_file_id,
                              status, starts_at, expected_end_at, next_update_at, publish_at,
                              unpublish_at, pinned_until, contact_info, requires_acknowledgement,
                              channels, published_at, created_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                 case when $8 = 'published' then now() else null end, $18)
         returning id`,
        [
          auth.orgId,
          input.kind,
          input.severity,
          input.title,
          input.bodyHtml,
          input.summary ?? null,
          input.imageFileId ?? null,
          status,
          input.startsAt ?? null,
          input.expectedEndAt ?? null,
          input.nextUpdateAt ?? null,
          input.publishAt ?? null,
          input.unpublishAt ?? null,
          input.pinnedUntil ?? null,
          input.contactInfo ?? null,
          input.requiresAcknowledgement,
          input.channels,
          auth.userId,
        ],
      );
      const noticeId = result.rows[0]!.id;

      for (const entry of input.audience) {
        await client.query(
          'insert into notice_audiences (org_id, notice_id, scope, scope_id) values ($1,$2,$3,$4)',
          [auth.orgId, noticeId, entry.scope, entry.scopeId ?? null],
        );
      }
      if (input.translations) {
        for (const [locale, translation] of Object.entries(input.translations)) {
          if (!translation) continue;
          await client.query(
            `insert into notice_translations (org_id, notice_id, locale, title, body_html)
             values ($1,$2,$3,$4,$5)
             on conflict (notice_id, locale) do update
               set title = excluded.title, body_html = excluded.body_html`,
            [auth.orgId, noticeId, locale, translation.title, translation.bodyHtml],
          );
        }
      }

      let recipients = 0;
      if (status === 'published') {
        recipients = await deliverNotice(client, auth.orgId, noticeId, input);
      }

      await audit(request, {
        action: status === 'published' ? 'notice.published' : 'notice.scheduled',
        entityType: 'notice',
        entityId: noticeId,
        detail: { kind: input.kind, severity: input.severity, recipients },
      });
      return { id: noticeId, status, recipients };
    });
  });

  app.patch<{ Params: { id: string } }>('/api/staff/notices/:id', async (request) => {
    const auth = requirePermission(request, 'notice:write');
    const input = parse(updateNoticeSchema, request.body);
    return db(request, async (client) => {
      const current = await client.query<{ status: string }>(
        'select status from notices where id = $1',
        [request.params.id],
      );
      if (!current.rowCount) throw notFound('Informationen hittades inte.');
      if (input.status === 'published' && !auth.permissions.has('notice:publish')) {
        throw badRequest('Du saknar behörighet att publicera.');
      }

      const fields: Record<string, unknown> = {
        kind: input.kind,
        severity: input.severity,
        title: input.title,
        body_html: input.bodyHtml,
        summary: input.summary,
        image_file_id: input.imageFileId,
        status: input.status,
        starts_at: input.startsAt,
        expected_end_at: input.expectedEndAt,
        next_update_at: input.nextUpdateAt,
        publish_at: input.publishAt,
        unpublish_at: input.unpublishAt,
        pinned_until: input.pinnedUntil,
        contact_info: input.contactInfo,
        requires_acknowledgement: input.requiresAcknowledgement,
        channels: input.channels,
      };
      const entries = Object.entries(fields).filter(([, value]) => value !== undefined);
      if (entries.length) {
        const params: unknown[] = [request.params.id];
        const sets = entries.map(([key, value]) => {
          params.push(value);
          return `${key} = $${params.length}`;
        });
        if (input.status === 'published') sets.push('published_at = coalesce(published_at, now())');
        if (input.status === 'resolved') sets.push('resolved_at = now()');
        await client.query(`update notices set ${sets.join(', ')} where id = $1`, params);
      }

      if (input.audience) {
        await client.query('delete from notice_audiences where notice_id = $1', [request.params.id]);
        for (const entry of input.audience) {
          await client.query(
            'insert into notice_audiences (org_id, notice_id, scope, scope_id) values ($1,$2,$3,$4)',
            [auth.orgId, request.params.id, entry.scope, entry.scopeId ?? null],
          );
        }
      }

      let recipients = 0;
      if (input.status === 'published' && current.rows[0]!.status !== 'published') {
        const full = await client.query<{
          title: string;
          summary: string | null;
          severity: string;
          kind: string;
          channels: string[];
          requires_acknowledgement: boolean;
        }>(
          'select title, summary, severity, kind, channels, requires_acknowledgement from notices where id = $1',
          [request.params.id],
        );
        const row = full.rows[0]!;
        recipients = await deliverNotice(client, auth.orgId, request.params.id, {
          title: row.title,
          summary: row.summary ?? undefined,
          severity: row.severity as never,
          kind: row.kind as never,
          channels: row.channels as never,
          requiresAcknowledgement: row.requires_acknowledgement,
        });
      }

      await audit(request, { action: 'notice.updated', entityType: 'notice', entityId: request.params.id, detail: { recipients } });
      return { updated: true, recipients };
    });
  });

  app.delete<{ Params: { id: string } }>('/api/staff/notices/:id', async (request) => {
    requirePermission(request, 'notice:write');
    return db(request, async (client) => {
      const result = await client.query<{ status: string }>(
        'select status from notices where id = $1',
        [request.params.id],
      );
      if (!result.rowCount) throw notFound('Informationen hittades inte.');
      // Publicerad information tas inte bort, den arkiveras – historiken ska finnas kvar.
      if (result.rows[0]!.status === 'published') {
        await client.query("update notices set status = 'archived', unpublish_at = now() where id = $1", [
          request.params.id,
        ]);
        await audit(request, { action: 'notice.archived', entityType: 'notice', entityId: request.params.id });
        return { archived: true };
      }
      await client.query('delete from notices where id = $1', [request.params.id]);
      await audit(request, { action: 'notice.deleted', entityType: 'notice', entityId: request.params.id });
      return { deleted: true };
    });
  });

  /** Vilka som har läst respektive bekräftat, för uppföljning. */
  app.get<{ Params: { id: string } }>('/api/staff/notices/:id/receipts', async (request) => {
    requirePermission(request, 'notice:read');
    return db(request, async (client) => {
      const audience = await client.query<{ scope: string; scope_id: string | null }>(
        'select scope, scope_id from notice_audiences where notice_id = $1',
        [request.params.id],
      );
      const total = await countAudience(
        client,
        audience.rows.map((r) => ({ scope: r.scope as never, scopeId: r.scope_id })),
      );
      const reads = await client.query<{ read: number; acknowledged: number }>(
        `select count(*)::int as read,
                count(*) filter (where acknowledged_at is not null)::int as acknowledged
           from notice_reads where notice_id = $1`,
        [request.params.id],
      );
      const delivery = await client.query<{ status: string; channel: string; count: number }>(
        `select status, channel, count(*)::int as count
           from notifications where link_route = 'notice' and link_id = $1
          group by status, channel`,
        [request.params.id],
      );
      return {
        recipients: total.residents,
        read: reads.rows[0]?.read ?? 0,
        acknowledged: reads.rows[0]?.acknowledged ?? 0,
        delivery: delivery.rows,
      };
    });
  });
}

/** Skickar notiser till alla som berörs av publiceringen. */
export async function deliverNotice(
  client: import('pg').PoolClient,
  orgId: string,
  noticeId: string,
  notice: {
    title: string;
    summary?: string;
    severity: 'critical' | 'important' | 'info';
    kind: NoticeKind;
    channels: ('inapp' | 'push' | 'email' | 'sms')[];
    requiresAcknowledgement?: boolean;
  },
): Promise<number> {
  const audience = await client.query<{ scope: string; scope_id: string | null }>(
    'select scope, scope_id from notice_audiences where notice_id = $1',
    [noticeId],
  );
  const users = await resolveAudienceUsers(
    client,
    audience.rows.map((r) => ({ scope: r.scope as never, scopeId: r.scope_id })),
  );
  if (!users.length) return 0;

  const topic =
    notice.severity === 'critical'
      ? 'safety_critical'
      : OPERATIONAL_NOTICE_KINDS.includes(notice.kind)
        ? 'operational_info'
        : 'news';

  await notify(client, {
    orgId,
    userIds: [...new Set(users.map((u) => u.userId))],
    topic,
    title: notice.title,
    body: notice.summary ?? notice.title,
    linkRoute: 'notice',
    linkId: noticeId,
    dedupeKey: `notice:${noticeId}`,
    requiresAcknowledgement: notice.requiresAcknowledgement ?? false,
    channels: notice.channels,
  });
  return new Set(users.map((u) => u.userId)).size;
}
