import type { Locale, Role } from '@hemvist/shared';
import { STAFF_ROLES, permissionsForRoles, surfaceForRole } from '@hemvist/shared';
import type pg from 'pg';
import { config } from '../config.js';
import { withOrg } from '../db/pool.js';
import type { AuthContext, UserScopes } from './context.js';
import { generateToken, hashToken, signAccessToken, verifyAccessToken } from './crypto.js';

interface SessionRow {
  session_id: string;
  user_id: string;
  org_id: string;
  org_slug: string;
  email: string;
  first_name: string;
  last_name: string;
  locale: Locale;
  status: string;
  contractor_org_id: string | null;
  expires_at: Date;
  idle_expires_at: Date;
  revoked_at: Date | null;
}

/** Läser hela behörighetsbilden för en session. Returnerar null om den inte gäller. */
export async function loadAuthContext(token: string): Promise<AuthContext | null> {
  const payload = verifyAccessToken(token);
  if (!payload) return null;

  return withOrg({ orgId: payload.org, userId: payload.sub }, async (client) => {
    const sessionResult = await client.query<SessionRow>(
      `select s.id as session_id, s.user_id, s.org_id, o.slug as org_slug,
              u.email, u.first_name, u.last_name, u.locale, u.status, u.contractor_org_id,
              s.expires_at, s.idle_expires_at, s.revoked_at
         from sessions s
         join users u on u.id = s.user_id
         join organisations o on o.id = s.org_id
        where s.id = $1 and s.user_id = $2`,
      [payload.sid, payload.sub],
    );
    const session = sessionResult.rows[0];
    if (!session) return null;

    const now = new Date();
    if (session.revoked_at) return null;
    if (session.expires_at <= now) return null;
    // Sessioner avslutas efter inaktivitet (krav C.2.10).
    if (session.idle_expires_at <= now) {
      await client.query(
        `update sessions set revoked_at = now(), revoked_reason = 'idle_timeout' where id = $1`,
        [session.session_id],
      );
      return null;
    }
    if (session.status !== 'active') return null;

    const roleResult = await client.query<{ role: Role }>(
      'select role from user_roles where user_id = $1',
      [session.user_id],
    );
    const roles = roleResult.rows.map((r) => r.role);
    if (roles.length === 0) return null;

    const scopes = await loadScopes(client, session.user_id, roles);
    const tenancyResult = await client.query<{ tenancy_id: string }>(
      `select tr.tenancy_id
         from tenancy_residents tr
         join tenancies t on t.id = tr.tenancy_id
        where tr.user_id = $1
          and tr.moved_out_at is null
          and t.status in ('upcoming','active','notice_given')`,
      [session.user_id],
    );

    // Skjut fram inaktivitetsgränsen först när sessionen faktiskt används.
    const idleSeconds = roles.some((r) => STAFF_ROLES.includes(r))
      ? config.auth.staffIdleTimeoutSeconds
      : config.auth.residentIdleTimeoutSeconds;
    await client.query(
      `update sessions
          set last_seen_at = now(),
              idle_expires_at = least(now() + make_interval(secs => $2), expires_at)
        where id = $1`,
      [session.session_id, idleSeconds],
    );

    const primaryRole = roles.find((r) => STAFF_ROLES.includes(r)) ?? roles[0]!;
    return {
      userId: session.user_id,
      orgId: session.org_id,
      orgSlug: session.org_slug,
      sessionId: session.session_id,
      email: session.email,
      firstName: session.first_name,
      lastName: session.last_name,
      roles,
      permissions: permissionsForRoles(roles),
      surface: surfaceForRole(primaryRole),
      contractorOrgId: session.contractor_org_id,
      scopes,
      locale: session.locale,
      tenancyIds: tenancyResult.rows.map((r) => r.tenancy_id),
    } satisfies AuthContext;
  });
}

async function loadScopes(
  client: pg.PoolClient,
  userId: string,
  roles: Role[],
): Promise<UserScopes> {
  const result = await client.query<{ scope: 'area' | 'property'; scope_id: string }>(
    'select scope, scope_id from user_scopes where user_id = $1',
    [userId],
  );
  const areaIds = result.rows.filter((r) => r.scope === 'area').map((r) => r.scope_id);
  const propertyIds = result.rows.filter((r) => r.scope === 'property').map((r) => r.scope_id);

  // Roller som förvaltar hela organisationen behöver ingen avgränsning. Övriga
  // personalroller utan tilldelning ser ingenting förrän en avgränsning sätts.
  const orgWideRoles: Role[] = ['admin', 'superadmin', 'customer_service'];
  const unrestricted =
    roles.some((r) => orgWideRoles.includes(r)) ||
    (areaIds.length === 0 && propertyIds.length === 0 && !roles.some((r) => STAFF_ROLES.includes(r)));

  return { areaIds, propertyIds, unrestricted };
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

/** Skapar en ny session och returnerar token-paret. Uppdateringstoken lagras hashad. */
export async function issueSession(
  client: pg.PoolClient,
  params: {
    orgId: string;
    userId: string;
    roles: Role[];
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<IssuedSession> {
  const refreshToken = generateToken(48);
  const isStaff = params.roles.some((r) => STAFF_ROLES.includes(r));
  const idleSeconds = isStaff
    ? config.auth.staffIdleTimeoutSeconds
    : config.auth.residentIdleTimeoutSeconds;

  const result = await client.query<{ id: string }>(
    `insert into sessions (org_id, user_id, refresh_token_hash, user_agent, ip, expires_at, idle_expires_at)
     values ($1,$2,$3,$4,$5, now() + make_interval(secs => $6), now() + make_interval(secs => $7))
     returning id`,
    [
      params.orgId,
      params.userId,
      hashToken(refreshToken),
      params.userAgent ?? null,
      params.ip ?? null,
      config.auth.refreshTokenTtlSeconds,
      Math.min(idleSeconds, config.auth.refreshTokenTtlSeconds),
    ],
  );

  const sessionId = result.rows[0]!.id;
  const primaryRole = params.roles.find((r) => STAFF_ROLES.includes(r)) ?? params.roles[0]!;
  const accessToken = signAccessToken({
    sub: params.userId,
    org: params.orgId,
    sid: sessionId,
    roles: params.roles,
    surface: surfaceForRole(primaryRole),
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: config.auth.accessTokenTtlSeconds,
    sessionId,
  };
}

export async function revokeSession(
  client: pg.PoolClient,
  sessionId: string,
  reason: string,
): Promise<void> {
  await client.query(
    'update sessions set revoked_at = now(), revoked_reason = $2 where id = $1 and revoked_at is null',
    [sessionId, reason],
  );
}
