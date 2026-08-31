import type { FastifyInstance } from 'fastify';
import { broadcastSchema, createThreadSchema, replyThreadSchema } from '@hemvist/shared';
import { audit } from '../core/audit.js';
import { countAudience, resolveAudienceUsers } from '../core/audience.js';
import { db, requireAuth, requirePermission } from '../core/context.js';
import { badRequest, forbidden, notFound } from '../core/errors.js';
import { notify } from '../core/notify.js';
import { parse } from '../core/validate.js';

/**
 * Meddelanden mellan hyresgäst och förvaltning, samt riktade utskick.
 *
 * All kommunikation samlas i trådar som är spårbara. Interna anteckningar i en
 * tråd visas aldrig för hyresgästen.
 */
export async function registerMessageRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/threads', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query(
        `select t.id, t.subject, t.status, t.last_message_at, t.created_at, t.case_id,
                c.case_number,
                (select body from messages m where m.thread_id = t.id and not m.internal
                  order by m.created_at desc limit 1) as last_message,
                (select count(*)::int from messages m
                  where m.thread_id = t.id and not m.internal
                    and m.created_at > coalesce(tp.last_read_at, 'epoch'::timestamptz)
                    and m.author_user_id is distinct from $1) as unread
           from threads t
           join thread_participants tp on tp.thread_id = t.id and tp.user_id = $1
           left join cases c on c.id = t.case_id
          order by t.last_message_at desc limit 100`,
        [auth.userId],
      );
      return { threads: result.rows };
    });
  });

  app.get<{ Params: { id: string } }>('/api/threads/:id', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const isStaff = auth.surface === 'staff' && auth.permissions.has('message:read');
      const access = await client.query<{ id: string; subject: string; status: string; case_id: string | null }>(
        `select t.id, t.subject, t.status, t.case_id from threads t
          where t.id = $1
            and ($3::boolean or exists (
                  select 1 from thread_participants tp
                   where tp.thread_id = t.id and tp.user_id = $2))`,
        [request.params.id, auth.userId, isStaff],
      );
      const thread = access.rows[0];
      if (!thread) throw notFound('Meddelandetråden hittades inte.');

      const messages = await client.query(
        `select m.id, m.body, m.internal, m.created_at,
                u.first_name, u.last_name,
                exists (select 1 from user_roles ur where ur.user_id = m.author_user_id
                          and ur.role not in ('tenant','co_resident')) as from_staff
           from messages m left join users u on u.id = m.author_user_id
          where m.thread_id = $1 and ($2::boolean or m.internal = false)
          order by m.created_at`,
        [thread.id, isStaff],
      );
      const attachments = await client.query(
        `select ma.message_id, f.id as file_id, f.original_name, f.mime_type, f.size_bytes
           from message_attachments ma join files f on f.id = ma.file_id
           join messages m on m.id = ma.message_id
          where m.thread_id = $1`,
        [thread.id],
      );

      await client.query(
        'update thread_participants set last_read_at = now() where thread_id = $1 and user_id = $2',
        [thread.id, auth.userId],
      );
      if (isStaff) {
        await client.query('update threads set unread_for_staff = false where id = $1', [thread.id]);
      }

      return { thread, messages: messages.rows, attachments: attachments.rows };
    });
  });

  app.post('/api/threads', async (request) => {
    const auth = requireAuth(request);
    const input = parse(createThreadSchema, request.body);
    const isStaff = auth.surface === 'staff';
    if (!isStaff) requirePermission(request, 'self:message:send');
    else requirePermission(request, 'message:write');

    return db(request, async (client) => {
      let tenancyId = input.tenancyId ?? null;
      if (!isStaff) {
        tenancyId = tenancyId && auth.tenancyIds.includes(tenancyId) ? tenancyId : auth.tenancyIds[0] ?? null;
      }

      const thread = await client.query<{ id: string }>(
        `insert into threads (org_id, subject, tenancy_id, created_by, last_message_at, unread_for_staff)
         values ($1,$2,$3,$4, now(), $5) returning id`,
        [auth.orgId, input.subject, tenancyId, auth.userId, !isStaff],
      );
      const threadId = thread.rows[0]!.id;

      await client.query(
        'insert into thread_participants (org_id, thread_id, user_id, side) values ($1,$2,$3,$4)',
        [auth.orgId, threadId, auth.userId, isStaff ? 'staff' : 'resident'],
      );

      // Personal som startar en tråd riktar den mot en hyresgäst.
      const recipients: string[] = [];
      if (isStaff) {
        if (input.recipientUserId) {
          recipients.push(input.recipientUserId);
        } else if (tenancyId) {
          const residents = await client.query<{ user_id: string }>(
            'select user_id from tenancy_residents where tenancy_id = $1 and moved_out_at is null',
            [tenancyId],
          );
          recipients.push(...residents.rows.map((r) => r.user_id));
        }
        if (!recipients.length) throw badRequest('Ange vilken hyresgäst meddelandet gäller.');
        for (const userId of recipients) {
          await client.query(
            `insert into thread_participants (org_id, thread_id, user_id, side) values ($1,$2,$3,'resident')
             on conflict do nothing`,
            [auth.orgId, threadId, userId],
          );
        }
      }

      const message = await client.query<{ id: string }>(
        'insert into messages (org_id, thread_id, author_user_id, body) values ($1,$2,$3,$4) returning id',
        [auth.orgId, threadId, auth.userId, input.body],
      );
      await attachToMessage(client, auth, message.rows[0]!.id, input.attachmentIds);

      if (recipients.length) {
        await notify(client, {
          orgId: auth.orgId,
          userIds: recipients,
          topic: 'case_messages',
          title: 'Nytt meddelande från din hyresvärd',
          body: input.subject,
          linkRoute: 'thread',
          linkId: threadId,
          dedupeKey: `thread:${threadId}`,
        });
      }

      await audit(request, { action: 'message.thread_created', entityType: 'thread', entityId: threadId });
      return { threadId };
    });
  });

  app.post<{ Params: { id: string } }>('/api/threads/:id/messages', async (request) => {
    const auth = requireAuth(request);
    const input = parse(replyThreadSchema, request.body);
    const isStaff = auth.surface === 'staff' && auth.permissions.has('message:write');
    if (input.internal && !isStaff) throw forbidden();

    return db(request, async (client) => {
      const access = await client.query<{ id: string; subject: string }>(
        `select t.id, t.subject from threads t
          where t.id = $1 and ($3::boolean or exists (
                select 1 from thread_participants tp where tp.thread_id = t.id and tp.user_id = $2))`,
        [request.params.id, auth.userId, isStaff],
      );
      const thread = access.rows[0];
      if (!thread) throw notFound('Meddelandetråden hittades inte.');

      if (isStaff) {
        await client.query(
          `insert into thread_participants (org_id, thread_id, user_id, side) values ($1,$2,$3,'staff')
           on conflict do nothing`,
          [auth.orgId, thread.id, auth.userId],
        );
      }

      const message = await client.query<{ id: string }>(
        'insert into messages (org_id, thread_id, author_user_id, body, internal) values ($1,$2,$3,$4,$5) returning id',
        [auth.orgId, thread.id, auth.userId, input.body, input.internal],
      );
      await attachToMessage(client, auth, message.rows[0]!.id, input.attachmentIds);
      await client.query(
        'update threads set last_message_at = now(), unread_for_staff = $2 where id = $1',
        [thread.id, !isStaff],
      );

      if (!input.internal) {
        const others = await client.query<{ user_id: string; side: string }>(
          'select user_id, side from thread_participants where thread_id = $1 and user_id <> $2',
          [thread.id, auth.userId],
        );
        const residentRecipients = others.rows.filter((r) => r.side === 'resident').map((r) => r.user_id);
        if (isStaff && residentRecipients.length) {
          await notify(client, {
            orgId: auth.orgId,
            userIds: residentRecipients,
            topic: 'case_messages',
            title: 'Nytt svar från din hyresvärd',
            body: thread.subject,
            linkRoute: 'thread',
            linkId: thread.id,
            dedupeKey: `message:${message.rows[0]!.id}`,
          });
        }
      }

      await audit(request, {
        action: 'message.sent',
        entityType: 'thread',
        entityId: thread.id,
        detail: { internal: input.internal },
      });
      return { messageId: message.rows[0]!.id };
    });
  });

  /* --------------------------------------------------------- utskick --- */

  app.get('/api/staff/threads', async (request) => {
    requirePermission(request, 'message:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select t.id, t.subject, t.status, t.last_message_at, t.unread_for_staff, t.case_id,
                u.first_name, u.last_name, uh.object_number, uh.property_name,
                (select body from messages m where m.thread_id = t.id and not m.internal
                  order by m.created_at desc limit 1) as last_message
           from threads t
           left join users u on u.id = t.created_by
           left join tenancies te on te.id = t.tenancy_id
           left join unit_hierarchy uh on uh.unit_id = te.unit_id
          order by t.unread_for_staff desc, t.last_message_at desc limit 200`,
      );
      return { threads: result.rows };
    });
  });

  app.post('/api/staff/broadcasts', async (request) => {
    const auth = requirePermission(request, 'message:write');
    const input = parse(broadcastSchema, request.body);
    return db(request, async (client) => {
      const counts = await countAudience(client, input.audience);
      const broadcast = await client.query<{ id: string }>(
        `insert into broadcasts (org_id, subject, body, channels, scheduled_at, requires_acknowledgement,
                                 recipient_count, created_by, sent_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8, case when $5::timestamptz is null then now() else null end)
         returning id`,
        [
          auth.orgId,
          input.subject,
          input.body,
          input.channels,
          input.scheduledAt ?? null,
          input.requiresAcknowledgement,
          counts.residents,
          auth.userId,
        ],
      );
      const broadcastId = broadcast.rows[0]!.id;
      for (const entry of input.audience) {
        await client.query(
          'insert into broadcast_audiences (org_id, broadcast_id, scope, scope_id) values ($1,$2,$3,$4)',
          [auth.orgId, broadcastId, entry.scope, entry.scopeId ?? null],
        );
      }

      let sent = 0;
      if (!input.scheduledAt) {
        const users = await resolveAudienceUsers(client, input.audience);
        sent = await notify(client, {
          orgId: auth.orgId,
          userIds: [...new Set(users.map((u) => u.userId))],
          topic: 'news',
          title: input.subject,
          body: input.body,
          linkRoute: 'broadcast',
          linkId: broadcastId,
          dedupeKey: `broadcast:${broadcastId}`,
          requiresAcknowledgement: input.requiresAcknowledgement,
          channels: input.channels,
        });
      }

      await audit(request, {
        action: input.scheduledAt ? 'broadcast.scheduled' : 'broadcast.sent',
        entityType: 'broadcast',
        entityId: broadcastId,
        detail: { recipients: counts.residents, channels: input.channels },
      });
      return { id: broadcastId, recipients: counts.residents, notificationsCreated: sent };
    });
  });

  app.get('/api/staff/broadcasts', async (request) => {
    requirePermission(request, 'message:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select b.id, b.subject, b.channels, b.scheduled_at, b.sent_at, b.recipient_count,
                b.created_at, u.first_name, u.last_name,
                (select count(*)::int from notifications n
                  where n.link_route = 'broadcast' and n.link_id = b.id and n.status = 'read') as read_count,
                (select count(*)::int from notifications n
                  where n.link_route = 'broadcast' and n.link_id = b.id and n.status = 'failed') as failed_count
           from broadcasts b left join users u on u.id = b.created_by
          order by coalesce(b.sent_at, b.scheduled_at, b.created_at) desc limit 100`,
      );
      return { broadcasts: result.rows };
    });
  });
}

async function attachToMessage(
  client: import('pg').PoolClient,
  auth: import('../core/context.js').AuthContext,
  messageId: string,
  fileIds: string[],
): Promise<void> {
  if (!fileIds.length) return;
  const valid = await client.query<{ id: string }>(
    "select id from files where id = any($1::uuid[]) and uploaded_by = $2 and scan_status = 'clean'",
    [fileIds, auth.userId],
  );
  if (valid.rowCount !== fileIds.length) throw badRequest('En eller flera bilagor kunde inte kopplas.');
  for (const file of valid.rows) {
    await client.query(
      'insert into message_attachments (org_id, message_id, file_id) values ($1,$2,$3) on conflict do nothing',
      [auth.orgId, messageId, file.id],
    );
  }
}
