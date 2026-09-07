import { timingSafeEqual } from 'node:crypto';
import type { Permission } from '@hemvist/shared';
import { OAUTH_SCOPE_KEYS, isOAuthScope, permissionsForScopes } from '@hemvist/shared';
import { config } from '../config.js';
import { withOrg, withoutOrg } from '../db/pool.js';
import type { AuthContext } from './context.js';
import { generateToken, hashPassword, hashToken, verifyPassword } from './crypto.js';

/**
 * OAuth 2.0 med client credentials (krav A.1.15).
 *
 * Anrop från andra system sker som klient, inte som person. Token är ett
 * ogenomskinligt värde som lagras hashat och kan återkallas direkt – till
 * skillnad från ett signerat token som gäller tills det går ut. Klienten får
 * exakt de behörigheter dess scope ger, aldrig fler (krav C.3.3).
 */

export interface OAuthTokenResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope: string;
}

export class OAuthError extends Error {
  constructor(
    readonly code:
      | 'invalid_request'
      | 'invalid_client'
      | 'invalid_scope'
      | 'unsupported_grant_type'
      | 'invalid_token',
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
    this.name = 'OAuthError';
  }
}

interface ClientRow {
  id: string;
  org_id: string;
  client_id: string;
  name: string;
  secret_hash: string;
  scopes: string[];
  status: string;
  allowed_ips: string[];
  token_ttl_seconds: number;
  expires_at: Date | null;
  service_user_id: string | null;
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Genererar ett klient-id och en hemlighet. Hemligheten visas en enda gång. */
export async function newClientCredentials(): Promise<{
  clientId: string;
  secret: string;
  secretHash: string;
  secretHint: string;
}> {
  const clientId = `hv_${generateToken(12)}`;
  const secret = generateToken(32);
  return {
    clientId,
    secret,
    secretHash: await hashPassword(secret),
    secretHint: secret.slice(-4),
  };
}

/**
 * Utfärdar ett token för client_credentials.
 *
 * Fel besvaras avsiktligt likadant oavsett om klienten inte finns eller
 * hemligheten är fel, så att endpointen inte går att använda för att räkna ut
 * vilka klient-id som existerar.
 */
export async function issueClientToken(input: {
  clientId: string;
  clientSecret: string;
  requestedScopes: string[];
  ip: string | null;
}): Promise<OAuthTokenResult> {
  const orgId = await withoutOrg(async (client) => {
    const result = await client.query<{ org_id: string | null }>(
      'select app.org_for_oauth_client($1) as org_id',
      [input.clientId],
    );
    return result.rows[0]?.org_id ?? null;
  });

  if (!orgId) {
    // Kostar samma tid som en riktig kontroll skulle ha gjort.
    await verifyPassword(input.clientSecret, null);
    throw new OAuthError('invalid_client', 'Klientuppgifterna godtogs inte.', 401);
  }

  return withOrg({ orgId }, async (client) => {
    const found = await client.query<ClientRow>(
      `select id, org_id, client_id, name, secret_hash, scopes, status, allowed_ips,
              token_ttl_seconds, expires_at, service_user_id
         from oauth_clients where client_id = $1`,
      [input.clientId],
    );
    const row = found.rows[0];
    if (!row) {
      await verifyPassword(input.clientSecret, null);
      throw new OAuthError('invalid_client', 'Klientuppgifterna godtogs inte.', 401);
    }

    const secretOk = await verifyPassword(input.clientSecret, row.secret_hash);
    if (!secretOk) {
      throw new OAuthError('invalid_client', 'Klientuppgifterna godtogs inte.', 401);
    }

    if (row.allowed_ips.length && (!input.ip || !row.allowed_ips.some((ip) => sameString(ip, input.ip!)))) {
      throw new OAuthError('invalid_client', 'Anropet kom från en adress som inte är tillåten.', 401);
    }

    // Utan begärt scope ges klientens hela tilldelning, annars den delmängd som
    // begärts. Ett scope klienten inte har tilldelats ger fel, inte tystnad.
    const requested = input.requestedScopes.length ? input.requestedScopes : row.scopes;
    for (const scope of requested) {
      if (!isOAuthScope(scope)) {
        throw new OAuthError('invalid_scope', `Okänt scope: ${scope}.`);
      }
      if (!row.scopes.includes(scope)) {
        throw new OAuthError('invalid_scope', `Klienten har inte tilldelats scope ${scope}.`);
      }
    }
    if (!requested.length) {
      throw new OAuthError('invalid_scope', 'Klienten saknar tilldelade scope.');
    }

    const token = generateToken(32);
    const expiresAt = new Date(Date.now() + row.token_ttl_seconds * 1000);
    await client.query(
      `insert into oauth_access_tokens (org_id, oauth_client_id, token_hash, scopes, issued_ip, expires_at)
       values ($1,$2,$3,$4,$5,$6)`,
      [orgId, row.id, hashToken(token), requested, input.ip, expiresAt],
    );
    await client.query(
      'update oauth_clients set last_used_at = now(), last_used_ip = $2 where id = $1',
      [row.id, input.ip],
    );

    return {
      accessToken: token,
      tokenType: 'Bearer' as const,
      expiresIn: row.token_ttl_seconds,
      scope: requested.join(' '),
    };
  });
}

interface TokenRow {
  token_id: string;
  org_id: string;
  org_slug: string;
  oauth_client_id: string;
  client_id: string;
  client_name: string;
  scopes: string[];
  expires_at: Date;
  service_user_id: string | null;
  client_status: string;
}

/**
 * Läser behörighetsbilden för ett integrationstoken.
 *
 * Ett klienttoken bär inga personuppgifter och ingen roll. Behörigheterna
 * kommer enbart från de scope som utfärdades, och ytan är `integration` så att
 * ett integrationstoken aldrig kan användas mot en yta avsedd för människor.
 */
export async function loadClientAuthContext(token: string): Promise<AuthContext | null> {
  const tokenHash = hashToken(token);
  const orgId = await withoutOrg(async (client) => {
    const result = await client.query<{ org_id: string | null }>(
      'select app.org_for_oauth_token($1) as org_id',
      [tokenHash],
    );
    return result.rows[0]?.org_id ?? null;
  });
  if (!orgId) return null;

  return withOrg({ orgId }, async (client) => {
    const result = await client.query<TokenRow>(
      `select t.id as token_id, t.org_id, o.slug as org_slug, t.oauth_client_id, t.scopes, t.expires_at,
              c.client_id, c.name as client_name, c.service_user_id, c.status as client_status
         from oauth_access_tokens t
         join oauth_clients c on c.id = t.oauth_client_id
         join organisations o on o.id = t.org_id
        where t.token_hash = $1 and t.revoked_at is null and t.expires_at > now()`,
      [tokenHash],
    );
    const row = result.rows[0];
    if (!row) return null;
    if (row.client_status !== 'active') return null;
    if (!row.service_user_id) return null;

    const permissions = permissionsForScopes(row.scopes) as Set<Permission>;

    return {
      userId: row.service_user_id,
      orgId: row.org_id,
      orgSlug: row.org_slug,
      sessionId: row.token_id,
      email: row.client_id,
      firstName: row.client_name,
      lastName: '',
      roles: [],
      permissions,
      surface: 'integration',
      contractorOrgId: null,
      scopes: { areaIds: [], propertyIds: [], unrestricted: true },
      locale: 'sv',
      tenancyIds: [],
      kind: 'client',
      oauthScopes: row.scopes,
      clientId: row.client_id,
    } satisfies AuthContext;
  });
}

/** Återkallar ett utfärdat token. Okända token besvaras utan att avslöja något. */
export async function revokeClientToken(token: string, reason: string): Promise<void> {
  const tokenHash = hashToken(token);
  const orgId = await withoutOrg(async (client) => {
    const result = await client.query<{ org_id: string | null }>(
      'select app.org_for_oauth_token($1) as org_id',
      [tokenHash],
    );
    return result.rows[0]?.org_id ?? null;
  });
  if (!orgId) return;
  await withOrg({ orgId }, async (client) => {
    await client.query(
      `update oauth_access_tokens set revoked_at = now(), revoked_reason = $2
        where token_hash = $1 and revoked_at is null`,
      [tokenHash, reason],
    );
  });
}

export const oauthMetadata = {
  issuer: config.publicApiUrl,
  token_endpoint: `${config.publicApiUrl}/api/oauth/token`,
  introspection_endpoint: `${config.publicApiUrl}/api/oauth/introspect`,
  revocation_endpoint: `${config.publicApiUrl}/api/oauth/revoke`,
  grant_types_supported: ['client_credentials'],
  token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
  scopes_supported: OAUTH_SCOPE_KEYS,
  response_types_supported: [],
};
