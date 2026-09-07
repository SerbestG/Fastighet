import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OAUTH_SCOPES, OAUTH_SCOPE_KEYS, isOAuthScope } from '@hemvist/shared';
import { z } from 'zod';
import { audit } from '../core/audit.js';
import { db, requirePermission } from '../core/context.js';
import { badRequest, notFound } from '../core/errors.js';
import {
  OAuthError,
  issueClientToken,
  newClientCredentials,
  oauthMetadata,
  revokeClientToken,
} from '../core/oauth.js';
import { hashToken } from '../core/crypto.js';
import { parse } from '../core/validate.js';

/**
 * OAuth 2.0-endpoints (krav A.1.15) samt administration av integrationskonton
 * (krav C.2.12). Tokenendpointen följer RFC 6749, introspektionen RFC 7662 och
 * återkallandet RFC 7009.
 */

const createClientSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  scopes: z.array(z.string()).min(1),
  allowedIps: z.array(z.string().trim().max(60)).max(20).optional(),
  tokenTtlSeconds: z.number().int().min(60).max(86_400).optional(),
  expiresAt: z.string().datetime().optional(),
});

/** Läser klientuppgifter från Basic-huvudet eller från formulärkroppen. */
function readClientCredentials(
  request: FastifyRequest,
  body: Record<string, string>,
): { clientId: string; clientSecret: string } {
  const header = request.headers.authorization;
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6).trim(), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator > 0) {
      return {
        clientId: decodeURIComponent(decoded.slice(0, separator)),
        clientSecret: decodeURIComponent(decoded.slice(separator + 1)),
      };
    }
  }
  return { clientId: body.client_id ?? '', clientSecret: body.client_secret ?? '' };
}

function asForm(body: unknown): Record<string, string> {
  if (!body || typeof body !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}

export async function registerOAuthRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------------------------------------ metadata --- */

  app.get('/api/oauth/metadata', async () => ({
    ...oauthMetadata,
    scopes: OAUTH_SCOPE_KEYS.map((key) => ({
      scope: key,
      label: OAUTH_SCOPES[key].label,
      description: OAUTH_SCOPES[key].description,
    })),
  }));

  /* --------------------------------------------------------------- token --- */

  app.post('/api/oauth/token', async (request, reply) => {
    const body = asForm(request.body);
    reply.header('cache-control', 'no-store');
    reply.header('pragma', 'no-cache');

    try {
      if (body.grant_type !== 'client_credentials') {
        throw new OAuthError(
          'unsupported_grant_type',
          'Endast client_credentials stöds på den här endpointen.',
        );
      }
      const { clientId, clientSecret } = readClientCredentials(request, body);
      if (!clientId || !clientSecret) {
        throw new OAuthError('invalid_request', 'Klientuppgifter saknas.', 400);
      }

      const result = await issueClientToken({
        clientId,
        clientSecret,
        requestedScopes: (body.scope ?? '').split(/\s+/).filter(Boolean),
        ip: request.ip ?? null,
      });

      return {
        access_token: result.accessToken,
        token_type: result.tokenType,
        expires_in: result.expiresIn,
        scope: result.scope,
      };
    } catch (error) {
      if (error instanceof OAuthError) {
        if (error.status === 401) reply.header('www-authenticate', 'Basic realm="hemvist"');
        request.log.info(
          { code: error.code, clientId: body.client_id ?? '(basic)' },
          'tokenbegäran avvisades',
        );
        return reply
          .status(error.status)
          .send({ error: error.code, error_description: error.description });
      }
      throw error;
    }
  });

  /* -------------------------------------------------------- introspektion --- */

  app.post('/api/oauth/introspect', async (request, reply) => {
    const body = asForm(request.body);
    reply.header('cache-control', 'no-store');
    const { clientId, clientSecret } = readClientCredentials(request, body);
    if (!clientId || !clientSecret) {
      reply.header('www-authenticate', 'Basic realm="hemvist"');
      return reply
        .status(401)
        .send({ error: 'invalid_client', error_description: 'Klientuppgifter saknas.' });
    }

    // Anroparen måste själv vara en giltig klient. Vi utfärdar inget token här,
    // utan använder kontrollen enbart för att verifiera identiteten.
    try {
      await issueClientToken({
        clientId,
        clientSecret,
        requestedScopes: [],
        ip: request.ip ?? null,
      });
    } catch (error) {
      if (error instanceof OAuthError) {
        reply.header('www-authenticate', 'Basic realm="hemvist"');
        return reply
          .status(401)
          .send({ error: 'invalid_client', error_description: error.description });
      }
      throw error;
    }

    const token = body.token;
    if (!token) return { active: false };

    const { loadClientAuthContext } = await import('../core/oauth.js');
    const context = await loadClientAuthContext(token);
    if (!context || context.clientId !== clientId) {
      // Ett token som tillhör någon annan redovisas som inaktivt.
      return { active: false };
    }
    return {
      active: true,
      client_id: context.clientId,
      scope: (context.oauthScopes ?? []).join(' '),
      token_type: 'Bearer',
    };
  });

  /* ---------------------------------------------------------- återkallande --- */

  app.post('/api/oauth/revoke', async (request, reply) => {
    const body = asForm(request.body);
    reply.header('cache-control', 'no-store');
    const { clientId, clientSecret } = readClientCredentials(request, body);
    if (!clientId || !clientSecret) {
      reply.header('www-authenticate', 'Basic realm="hemvist"');
      return reply.status(401).send({ error: 'invalid_client' });
    }
    try {
      await issueClientToken({ clientId, clientSecret, requestedScopes: [], ip: request.ip ?? null });
    } catch (error) {
      if (error instanceof OAuthError) {
        reply.header('www-authenticate', 'Basic realm="hemvist"');
        return reply.status(401).send({ error: 'invalid_client' });
      }
      throw error;
    }
    if (body.token) await revokeClientToken(body.token, 'client_request');
    // RFC 7009: svaret är detsamma oavsett om token fanns.
    return reply.status(200).send({});
  });

  /* -------------------------------------------------- administration i UI --- */

  app.get('/api/staff/integrations/clients', async (request) => {
    requirePermission(request, 'integration:read');
    return db(request, async (client) => {
      const result = await client.query(
        `select c.id, c.client_id, c.name, c.description, c.scopes, c.status, c.secret_hint,
                c.allowed_ips, c.token_ttl_seconds, c.expires_at, c.rotated_at,
                c.last_used_at, c.created_at,
                (select count(*)::int from oauth_access_tokens t
                  where t.oauth_client_id = c.id and t.revoked_at is null and t.expires_at > now())
                  as active_tokens
           from oauth_clients c
          order by c.name`,
      );
      return { clients: result.rows, scopes: OAUTH_SCOPE_KEYS.map((key) => ({ scope: key, ...OAUTH_SCOPES[key] })) };
    });
  });

  app.post('/api/staff/integrations/clients', async (request, reply) => {
    const auth = requirePermission(request, 'integration:write');
    const input = parse(createClientSchema, request.body);
    for (const scope of input.scopes) {
      if (!isOAuthScope(scope)) throw badRequest(`Okänt scope: ${scope}.`);
    }

    const credentials = await newClientCredentials();
    const created = await db(request, async (client) => {
      // Integrationen får ett eget, icke-personligt konto. Det saknar lösenord
      // och kan därför inte logga in någonstans (krav C.2.12).
      const serviceUser = await client.query<{ id: string }>(
        `insert into users (org_id, email, first_name, last_name, status, account_type)
         values ($1,$2,$3,$4,'active','service') returning id`,
        [auth.orgId, `${credentials.clientId}@integration.local`, input.name, 'Integration'],
      );
      const result = await client.query<{ id: string }>(
        `insert into oauth_clients
           (org_id, client_id, name, description, secret_hash, secret_hint, scopes,
            allowed_ips, token_ttl_seconds, expires_at, created_by, service_user_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning id`,
        [
          auth.orgId,
          credentials.clientId,
          input.name,
          input.description ?? null,
          credentials.secretHash,
          credentials.secretHint,
          input.scopes,
          input.allowedIps ?? [],
          input.tokenTtlSeconds ?? 3600,
          input.expiresAt ?? null,
          auth.userId,
          serviceUser.rows[0]!.id,
        ],
      );
      return result.rows[0]!.id;
    });

    await audit(request, {
      action: 'oauth.client.created',
      entityType: 'oauth_client',
      entityId: created,
      detail: { clientId: credentials.clientId, scopes: input.scopes },
    });

    // Hemligheten visas en enda gång och lagras aldrig i klartext.
    return reply.status(201).send({
      id: created,
      clientId: credentials.clientId,
      clientSecret: credentials.secret,
      note: 'Hemligheten visas bara nu. Spara den på ett säkert ställe.',
    });
  });

  app.post<{ Params: { id: string } }>(
    '/api/staff/integrations/clients/:id/rotate',
    async (request) => {
      requirePermission(request, 'integration:write');
      const credentials = await newClientCredentials();
      const clientIdText = await db(request, async (client) => {
        const result = await client.query<{ client_id: string }>(
          `update oauth_clients
              set secret_hash = $2, secret_hint = $3, rotated_at = now(), updated_at = now()
            where id = $1 returning client_id`,
          [request.params.id, credentials.secretHash, credentials.secretHint],
        );
        if (!result.rowCount) throw notFound('Integrationskontot hittades inte.');
        // Tidigare utfärdade token slutar gälla när hemligheten byts.
        await client.query(
          `update oauth_access_tokens set revoked_at = now(), revoked_reason = 'secret_rotated'
            where oauth_client_id = $1 and revoked_at is null`,
          [request.params.id],
        );
        return result.rows[0]!.client_id;
      });

      await audit(request, {
        action: 'oauth.client.rotated',
        entityType: 'oauth_client',
        entityId: request.params.id,
        detail: { clientId: clientIdText },
      });

      return {
        clientId: clientIdText,
        clientSecret: credentials.secret,
        note: 'Den tidigare hemligheten gäller inte längre. Uppdatera integrationen.',
      };
    },
  );

  app.patch<{ Params: { id: string }; Body: { status?: 'active' | 'disabled'; scopes?: string[] } }>(
    '/api/staff/integrations/clients/:id',
    async (request) => {
      const auth = requirePermission(request, 'integration:write');
      const { status, scopes } = request.body ?? {};
      if (scopes) {
        for (const scope of scopes) {
          if (!isOAuthScope(scope)) throw badRequest(`Okänt scope: ${scope}.`);
        }
      }

      await db(request, async (client) => {
        const result = await client.query(
          `update oauth_clients
              set status = coalesce($2, status),
                  scopes = coalesce($3, scopes),
                  disabled_at = case when $2 = 'disabled' then now() else disabled_at end,
                  disabled_by = case when $2 = 'disabled' then $4::uuid else disabled_by end,
                  updated_at = now()
            where id = $1`,
          [request.params.id, status ?? null, scopes ?? null, auth.userId],
        );
        if (!result.rowCount) throw notFound('Integrationskontot hittades inte.');
        if (status === 'disabled') {
          await client.query(
            `update oauth_access_tokens set revoked_at = now(), revoked_reason = 'client_disabled'
              where oauth_client_id = $1 and revoked_at is null`,
            [request.params.id],
          );
        }
      });

      await audit(request, {
        action: status === 'disabled' ? 'oauth.client.disabled' : 'oauth.client.updated',
        entityType: 'oauth_client',
        entityId: request.params.id,
        detail: { status, scopes },
      });
      return { ok: true };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/staff/integrations/clients/:id/tokens',
    async (request) => {
      requirePermission(request, 'integration:read');
      return db(request, async (client) => {
        const result = await client.query(
          `select id, scopes, issued_ip, issued_at, expires_at, revoked_at, revoked_reason
             from oauth_access_tokens
            where oauth_client_id = $1
            order by issued_at desc limit 100`,
          [request.params.id],
        );
        // Själva token redovisas aldrig, bara att det finns och när.
        return { tokens: result.rows };
      });
    },
  );
}

/** Används av tester för att kontrollera att ett token verkligen är återkallat. */
export function tokenFingerprint(token: string): string {
  return hashToken(token).slice(0, 12);
}
