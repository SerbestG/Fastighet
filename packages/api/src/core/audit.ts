import type { FastifyRequest } from 'fastify';
import type pg from 'pg';
import { withOrg } from '../db/pool.js';

/**
 * Säkerhetslogg.
 *
 * Loggen är append-only i databasen: applikationsrollen saknar UPDATE och DELETE
 * på tabellen (se 010_grants.sql). Fältet `detail` får aldrig innehålla lösenord,
 * hela tokens eller hemliga nycklar – funktionen nedan tar bort sådana fält om de
 * ändå skulle skickas med.
 */

const FORBIDDEN_KEYS = [
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'refreshtoken',
  'accesstoken',
  'secret',
  'mfa_secret',
  'apikey',
  'api_key',
  'authorization',
  'personalnumber',
  'personal_number',
];

export function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => scrub(item, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
        out[key] = '[borttaget]';
        continue;
      }
      out[key] = scrub(item, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

export interface AuditEntry {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  subjectUserId?: string | null;
  outcome?: 'success' | 'denied' | 'failure';
  detail?: Record<string, unknown>;
}

/** Skriver en rad i säkerhetsloggen inom en pågående transaktion. */
export async function auditWithin(
  client: pg.PoolClient,
  context: {
    orgId: string | null;
    actorUserId?: string | null;
    actorEmail?: string | null;
    actorRoles?: string[];
    ip?: string | null;
    userAgent?: string | null;
    traceId?: string | null;
  },
  entry: AuditEntry,
): Promise<void> {
  await client.query(
    `insert into audit_log
       (org_id, actor_user_id, actor_email, actor_roles, action, entity_type, entity_id,
        subject_user_id, ip, user_agent, trace_id, outcome, detail)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      context.orgId,
      context.actorUserId ?? null,
      context.actorEmail ?? null,
      context.actorRoles ?? null,
      entry.action,
      entry.entityType ?? null,
      entry.entityId ?? null,
      entry.subjectUserId ?? null,
      context.ip ?? null,
      context.userAgent ?? null,
      context.traceId ?? null,
      entry.outcome ?? 'success',
      JSON.stringify(scrub(entry.detail ?? {})),
    ],
  );
}

/** Skriver en loggrad i egen transaktion, utifrån den aktuella begäran. */
export async function audit(request: FastifyRequest, entry: AuditEntry): Promise<void> {
  const auth = request.auth;
  if (!auth) return;
  try {
    await withOrg({ orgId: auth.orgId, userId: auth.userId }, (client) =>
      auditWithin(
        client,
        {
          orgId: auth.orgId,
          actorUserId: auth.userId,
          actorEmail: auth.email,
          actorRoles: auth.roles,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
          traceId: request.traceId,
        },
        entry,
      ),
    );
  } catch (error) {
    // En misslyckad loggskrivning får inte fälla själva åtgärden, men den ska synas.
    request.log.error({ err: error, action: entry.action }, 'kunde inte skriva säkerhetslogg');
  }
}

/** Bygger loggkontext från begäran, för användning inom en befintlig transaktion. */
export function auditContext(request: FastifyRequest) {
  const auth = request.auth;
  return {
    orgId: auth?.orgId ?? null,
    actorUserId: auth?.userId ?? null,
    actorEmail: auth?.email ?? null,
    actorRoles: auth?.roles ?? [],
    ip: request.ip,
    userAgent: request.headers['user-agent'] ?? null,
    traceId: request.traceId,
  };
}
