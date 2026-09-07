import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { getPool, withOrg } from '../db/pool.js';
import { deliverNotice } from '../modules/notices.js';
import { notify } from '../core/notify.js';
import { resolveAudienceUsers } from '../core/audience.js';
import { WebPushError, sendPush, vapidKeys } from '../core/webpush.js';

/**
 * Bakgrundsjobb.
 *
 * Jobben körs i en enkel slinga i API-processen. De är avsiktligt idempotenta:
 * varje körning gör bara det som återstår, så att en omstart mitt i en körning
 * inte leder till dubbla utskick.
 */

type Job = { name: string; run: (log: FastifyBaseLogger) => Promise<number> };

/** Kör en åtgärd för varje organisation i plattformen. */
async function forEachOrg(fn: (orgId: string) => Promise<number>): Promise<number> {
  const pool = getPool();
  // Listan hämtas med en avgränsad funktion eftersom jobbet inte har någon
  // inloggad användare och därmed ingen organisation satt.
  const orgs = await pool.query<{ slug: string }>('select slug from app.public_organisations()');
  let total = 0;
  for (const row of orgs.rows) {
    const idResult = await pool.query<{ org_id_for_slug: string }>('select app.org_id_for_slug($1)', [
      row.slug,
    ]);
    const orgId = idResult.rows[0]?.org_id_for_slug;
    if (!orgId) continue;
    total += await fn(orgId);
  }
  return total;
}

const publishScheduledNotices: Job = {
  name: 'publish_scheduled_notices',
  async run(log) {
    return forEachOrg((orgId) =>
      withOrg({ orgId }, async (client) => {
        const due = await client.query<{
          id: string;
          title: string;
          summary: string | null;
          severity: 'critical' | 'important' | 'info';
          kind: string;
          channels: string[];
          requires_acknowledgement: boolean;
        }>(
          `update notices set status = 'published', published_at = now()
            where status = 'scheduled' and publish_at is not null and publish_at <= now()
            returning id, title, summary, severity, kind, channels, requires_acknowledgement`,
        );
        for (const notice of due.rows) {
          await deliverNotice(client, orgId, notice.id, {
            title: notice.title,
            summary: notice.summary ?? undefined,
            severity: notice.severity,
            kind: notice.kind as never,
            channels: notice.channels as never,
            requiresAcknowledgement: notice.requires_acknowledgement,
          });
          log.info({ noticeId: notice.id }, 'publicerade schemalagd information');
        }
        return due.rowCount ?? 0;
      }),
    );
  },
};

const unpublishExpiredNotices: Job = {
  name: 'unpublish_expired_notices',
  async run() {
    return forEachOrg((orgId) =>
      withOrg({ orgId }, async (client) => {
        const result = await client.query(
          `update notices set status = 'archived'
            where status = 'published' and unpublish_at is not null and unpublish_at <= now()`,
        );
        return result.rowCount ?? 0;
      }),
    );
  },
};

const sendScheduledBroadcasts: Job = {
  name: 'send_scheduled_broadcasts',
  async run() {
    return forEachOrg((orgId) =>
      withOrg({ orgId }, async (client) => {
        const due = await client.query<{ id: string; subject: string; body: string; channels: string[] }>(
          `update broadcasts set sent_at = now()
            where sent_at is null and scheduled_at is not null and scheduled_at <= now()
            returning id, subject, body, channels`,
        );
        for (const broadcast of due.rows) {
          const audience = await client.query<{ scope: string; scope_id: string | null }>(
            'select scope, scope_id from broadcast_audiences where broadcast_id = $1',
            [broadcast.id],
          );
          const users = await resolveAudienceUsers(
            client,
            audience.rows.map((r) => ({ scope: r.scope as never, scopeId: r.scope_id })),
          );
          await notify(client, {
            orgId,
            userIds: [...new Set(users.map((u) => u.userId))],
            topic: 'news',
            title: broadcast.subject,
            body: broadcast.body,
            linkRoute: 'broadcast',
            linkId: broadcast.id,
            dedupeKey: `broadcast:${broadcast.id}`,
            channels: broadcast.channels as never,
          });
        }
        return due.rowCount ?? 0;
      }),
    );
  },
};

const sendBookingReminders: Job = {
  name: 'send_booking_reminders',
  async run() {
    return forEachOrg((orgId) =>
      withOrg({ orgId }, async (client) => {
        const due = await client.query<{ id: string; user_id: string; resource_name: string }>(
          `select b.id, b.user_id, r.name as resource_name
             from bookings b join resources r on r.id = b.resource_id
            where b.status in ('reserved','confirmed')
              and b.reminder_sent_at is null
              and b.user_id is not null
              and lower(b.slot) between now() and now() + interval '24 hours'`,
        );
        for (const booking of due.rows) {
          await notify(client, {
            orgId,
            userIds: [booking.user_id],
            topic: 'bookings',
            title: 'Påminnelse om din bokning',
            body: `${booking.resource_name} är bokad inom det närmaste dygnet.`,
            linkRoute: 'booking',
            linkId: booking.id,
            dedupeKey: `booking-reminder:${booking.id}`,
          });
          await client.query('update bookings set reminder_sent_at = now() where id = $1', [booking.id]);
        }
        return due.rowCount ?? 0;
      }),
    );
  },
};

const markOverdueInvoices: Job = {
  name: 'mark_overdue_invoices',
  async run() {
    return forEachOrg((orgId) =>
      withOrg({ orgId }, async (client) => {
        const result = await client.query(
          `update invoices set status = 'overdue'
            where status = 'open' and due_date < current_date`,
        );
        return result.rowCount ?? 0;
      }),
    );
  },
};

const expireAccessGrants: Job = {
  name: 'expire_access_grants',
  async run() {
    return forEachOrg((orgId) =>
      withOrg({ orgId }, async (client) => {
        // Behörigheter upphör automatiskt, och när boendeförhållandet upphör
        // stängs tillträdet (krav C.2.13).
        const expired = await client.query(
          `update access_grants set status = 'expired'
            where status in ('active','pending') and valid_to is not null and valid_to < now()`,
        );
        const ended = await client.query(
          `update access_grants g set status = 'revoked', revoked_at = now()
            where g.status in ('active','pending')
              and g.user_id is not null
              and not exists (
                select 1 from tenancy_residents tr
                  join tenancies t on t.id = tr.tenancy_id
                 where tr.user_id = g.user_id and tr.moved_out_at is null
                   and t.status in ('upcoming','active','notice_given'))`,
        );
        return (expired.rowCount ?? 0) + (ended.rowCount ?? 0);
      }),
    );
  },
};

const revokeExpiredSessions: Job = {
  name: 'revoke_expired_sessions',
  async run() {
    return forEachOrg((orgId) =>
      withOrg({ orgId }, async (client) => {
        const result = await client.query(
          `update sessions set revoked_at = now(), revoked_reason = 'expired'
            where revoked_at is null and (expires_at < now() or idle_expires_at < now())`,
        );
        return result.rowCount ?? 0;
      }),
    );
  },
};

const applyRetention: Job = {
  name: 'apply_retention',
  async run(log) {
    return forEachOrg((orgId) =>
      withOrg({ orgId }, async (client) => {
        const policies = await client.query<{ entity: string; retain_days: number; action: string }>(
          'select entity, retain_days, action from retention_policies where active',
        );
        let affected = 0;
        for (const policy of policies.rows) {
          if (policy.entity === 'notification') {
            const result = await client.query(
              'delete from notifications where created_at < now() - make_interval(days => $1)',
              [policy.retain_days],
            );
            affected += result.rowCount ?? 0;
          } else if (policy.entity === 'session') {
            const result = await client.query(
              `delete from sessions where revoked_at is not null
                 and revoked_at < now() - make_interval(days => $1)`,
              [policy.retain_days],
            );
            affected += result.rowCount ?? 0;
          } else if (policy.entity === 'login_attempt') {
            const result = await client.query(
              'delete from login_attempts where at < now() - make_interval(days => $1)',
              [policy.retain_days],
            );
            affected += result.rowCount ?? 0;
          }
          // Gallring av ärenden och säkerhetslogg kräver särskild hantering och
          // körs som en separat, granskad åtgärd.
        }
        if (affected) log.info({ affected }, 'gallring genomförd');
        return affected;
      }),
    );
  },
};


/**
 * Levererar köade pushnotiser (krav B.1.5).
 *
 * Varje körad rad går ut till alla enheter användaren registrerat. En
 * prenumeration som push-tjänsten säger är borta tas bort direkt, så att kön
 * inte fylls av enheter som inte finns.
 */
const deliverWebPush: Job = {
  name: 'deliver_web_push',
  run: async (log) => {
    if (!vapidKeys()) return 0;
    return forEachOrg(async (orgId) =>
      withOrg({ orgId }, async (client) => {
        const due = await client.query<{
          id: string;
          recipient: string;
          payload: { title: string; body: string; route: string | null; id: string | null };
          attempts: number;
        }>(
          `select id, recipient, payload, attempts from outbound_queue
            where channel = 'push' and status = 'pending' and attempts < 5
            order by created_at limit 100`,
        );

        let delivered = 0;
        for (const row of due.rows) {
          const subscriptions = await client.query<{
            id: string;
            endpoint: string;
            p256dh: string;
            auth_secret: string;
          }>(
            'select id, endpoint, p256dh, auth_secret from web_push_subscriptions where user_id = $1',
            [row.recipient],
          );

          if (!subscriptions.rowCount) {
            await client.query(
              `update outbound_queue set status = 'failed', attempts = attempts + 1,
                      last_error = 'ingen registrerad enhet', updated_at = now()
                where id = $1`,
              [row.id],
            );
            continue;
          }

          let anySucceeded = false;
          let lastError: string | null = null;

          for (const subscription of subscriptions.rows) {
            try {
              await sendPush(
                {
                  endpoint: subscription.endpoint,
                  p256dh: subscription.p256dh,
                  auth: subscription.auth_secret,
                },
                JSON.stringify(row.payload),
              );
              anySucceeded = true;
              await client.query(
                'update web_push_subscriptions set last_success_at = now(), failure_count = 0 where id = $1',
                [subscription.id],
              );
            } catch (error) {
              lastError = (error as Error).message;
              if (error instanceof WebPushError && error.permanent) {
                // Enheten finns inte längre hos push-tjänsten.
                await client.query('delete from web_push_subscriptions where id = $1', [subscription.id]);
              } else {
                await client.query(
                  `update web_push_subscriptions
                      set last_failure_at = now(), failure_count = failure_count + 1
                    where id = $1`,
                  [subscription.id],
                );
              }
            }
          }

          if (anySucceeded) {
            await client.query(
              `update outbound_queue set status = 'sent', attempts = attempts + 1,
                      sent_at = now(), updated_at = now() where id = $1`,
              [row.id],
            );
            await client.query(
              `update notifications set status = 'delivered', sent_at = now(), delivered_at = now()
                where id = (select notification_id from outbound_queue where id = $1)`,
              [row.id],
            );
            delivered += 1;
          } else {
            const attempts = row.attempts + 1;
            await client.query(
              `update outbound_queue
                  set status = case when $2 >= 5 then 'failed' else 'pending' end,
                      attempts = $2, last_error = $3, updated_at = now()
                where id = $1`,
              [row.id, attempts, lastError],
            );
          }
        }

        if (delivered) log.info({ delivered }, 'pushnotiser levererade');
        return delivered;
      }),
    );
  },
};

const JOBS: Job[] = [
  publishScheduledNotices,
  unpublishExpiredNotices,
  sendScheduledBroadcasts,
  sendBookingReminders,
  markOverdueInvoices,
  expireAccessGrants,
  revokeExpiredSessions,
  applyRetention,
  deliverWebPush,
];

export function startScheduler(log: FastifyBaseLogger): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    for (const job of JOBS) {
      const started = Date.now();
      try {
        const processed = await job.run(log);
        if (processed > 0) {
          log.info({ job: job.name, processed, ms: Date.now() - started }, 'bakgrundsjobb kört');
        }
        await recordRun(job.name, true, processed, null);
      } catch (error) {
        log.error({ err: error, job: job.name }, 'bakgrundsjobb misslyckades');
        await recordRun(job.name, false, 0, (error as Error).message);
      }
    }
    running = false;
  };

  const timer = setInterval(() => void tick(), config.jobs.intervalMs);
  void tick();
  return () => clearInterval(timer);
}

async function recordRun(job: string, ok: boolean, processed: number, error: string | null): Promise<void> {
  try {
    await getPool().query(
      'insert into job_runs (job, finished_at, ok, processed, error) values ($1, now(), $2, $3, $4)',
      [job, ok, processed, error],
    );
  } catch {
    // Körningsloggen får inte fälla jobbslingan.
  }
}
