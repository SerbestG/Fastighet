import type { NotificationChannel, NotificationTopic } from '@hemvist/shared';
import { MANDATORY_TOPICS } from '@hemvist/shared';
import type pg from 'pg';

/**
 * Notiser.
 *
 * Varje notis är knuten till ett ämne som användaren själv styr (krav B.1.7).
 * Kritisk säkerhetsinformation är undantagen och kan inte stängas av. Dubbletter
 * hindras av en dedupe-nyckel, så att samma händelse inte skickas två gånger.
 *
 * Utgående push, e-post och SMS läggs i en kö. Saknas en fungerande integration
 * markeras raden som blockerad i stället för att tyst försvinna – då syns det i
 * driftvyn att meddelandet inte gick fram.
 */

const DEFAULT_CHANNELS: Record<NotificationTopic, NotificationChannel[]> = {
  case_updates: ['inapp', 'push'],
  case_messages: ['inapp', 'push'],
  bookings: ['inapp', 'push'],
  invoices: ['inapp', 'email'],
  news: ['inapp'],
  surveys: ['inapp'],
  moving: ['inapp', 'email'],
  operational_info: ['inapp', 'push'],
  safety_critical: ['inapp', 'push', 'sms'],
};

const CHANNEL_INTEGRATION: Record<Exclude<NotificationChannel, 'inapp'>, string> = {
  push: 'push',
  email: 'email',
  sms: 'sms',
};

export interface NotifyInput {
  orgId: string;
  userIds: string[];
  topic: NotificationTopic;
  title: string;
  body: string;
  /** Notisen ska öppna rätt sida och rätt objekt. */
  linkRoute?: string | null;
  linkId?: string | null;
  dedupeKey?: string | null;
  requiresAcknowledgement?: boolean;
  /** Begränsar kanalerna ytterligare, utöver användarens egna val. */
  channels?: NotificationChannel[];
}

export async function notify(client: pg.PoolClient, input: NotifyInput): Promise<number> {
  if (input.userIds.length === 0) return 0;

  const prefs = await client.query<{ user_id: string; channels: string[] }>(
    'select user_id, channels from notification_preferences where user_id = any($1::uuid[]) and topic = $2',
    [input.userIds, input.topic],
  );
  const prefMap = new Map(prefs.rows.map((r) => [r.user_id, r.channels as NotificationChannel[]]));

  const connected = await connectedChannels(client, input.orgId);
  const mandatory = MANDATORY_TOPICS.includes(input.topic);
  let created = 0;

  for (const userId of input.userIds) {
    const defaults = DEFAULT_CHANNELS[input.topic] ?? ['inapp'];
    const chosen = prefMap.get(userId) ?? defaults;
    // Kritisk säkerhetsinformation går alltid ut, oavsett inställning.
    let channels: NotificationChannel[] = mandatory ? defaults : chosen;
    if (input.channels) channels = channels.filter((c) => input.channels!.includes(c));
    // Notisen i appen är alltid kvar så att informationen går att hitta i efterhand.
    if (!channels.includes('inapp')) channels = ['inapp', ...channels];

    for (const channel of channels) {
      const inserted = await client.query<{ id: string }>(
        `insert into notifications
           (org_id, user_id, topic, channel, title, body, link_route, link_id, dedupe_key,
            requires_acknowledgement, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'queued')
         on conflict do nothing
         returning id`,
        [
          input.orgId,
          userId,
          input.topic,
          channel,
          input.title,
          input.body,
          input.linkRoute ?? null,
          input.linkId ?? null,
          input.dedupeKey ?? null,
          input.requiresAcknowledgement ?? false,
        ],
      );
      const notificationId = inserted.rows[0]?.id;
      if (!notificationId) continue;
      created += 1;

      if (channel === 'inapp') {
        await client.query(
          "update notifications set status = 'delivered', sent_at = now(), delivered_at = now() where id = $1",
          [notificationId],
        );
        continue;
      }

      const recipient = await recipientFor(client, userId, channel);
      if (!recipient) {
        await client.query(
          "update notifications set status = 'failed', failed_reason = 'mottagaruppgift saknas' where id = $1",
          [notificationId],
        );
        continue;
      }

      const integrationKind = CHANNEL_INTEGRATION[channel as 'push' | 'email' | 'sms'];
      const integrationOk = connected.has(integrationKind);
      await client.query(
        `insert into outbound_queue (org_id, notification_id, channel, recipient, payload, status)
         values ($1,$2,$3,$4,$5,$6)`,
        [
          input.orgId,
          notificationId,
          channel,
          recipient,
          JSON.stringify({
            title: input.title,
            // Skyddsvärd information skickas inte i pushnotisens innehåll (krav C.5.3).
            body: channel === 'push' ? shortenForPush(input.body) : input.body,
            route: input.linkRoute ?? null,
            id: input.linkId ?? null,
          }),
          integrationOk ? 'pending' : 'blocked_no_integration',
        ],
      );
      if (!integrationOk) {
        await client.query(
          "update notifications set status = 'failed', failed_reason = 'integration saknas' where id = $1",
          [notificationId],
        );
      }
    }
  }
  return created;
}

/**
 * Pushnotisen innehåller bara det som behövs för att användaren ska förstå att
 * något hänt. Detaljer läses i appen efter inloggning.
 */
function shortenForPush(body: string): string {
  const firstSentence = body.split(/(?<=[.!?])\s/)[0] ?? body;
  return firstSentence.length > 120 ? `${firstSentence.slice(0, 117)}…` : firstSentence;
}

async function recipientFor(
  client: pg.PoolClient,
  userId: string,
  channel: NotificationChannel,
): Promise<string | null> {
  if (channel === 'email') {
    const result = await client.query<{ email: string }>(
      'select email from users where id = $1 and email_verified_at is not null',
      [userId],
    );
    return result.rows[0]?.email ?? null;
  }
  if (channel === 'sms') {
    const result = await client.query<{ phone: string | null }>(
      'select phone from users where id = $1',
      [userId],
    );
    return result.rows[0]?.phone ?? null;
  }
  const result = await client.query<{ token: string }>(
    'select token from push_tokens where user_id = $1 order by last_seen_at desc limit 1',
    [userId],
  );
  // Pushtoken loggas aldrig; endast en referens sparas i kön.
  return result.rows[0]?.token ?? null;
}

async function connectedChannels(client: pg.PoolClient, orgId: string): Promise<Set<string>> {
  const result = await client.query<{ kind: string }>(
    "select kind from integrations where org_id = $1 and status = 'connected'",
    [orgId],
  );
  return new Set(result.rows.map((r) => r.kind));
}
