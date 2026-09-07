import type { FastifyInstance } from 'fastify';
import type { Role } from '@hemvist/shared';
import { ROLES, STAFF_ROLES } from '@hemvist/shared';
import { z } from 'zod';
import { config } from '../config.js';
import { auditWithin } from '../core/audit.js';
import { db, requirePermission } from '../core/context.js';
import { hashToken } from '../core/crypto.js';
import { badRequest, notFound, unauthorized } from '../core/errors.js';
import {
  OidcError,
  authorizationUrl,
  createPkce,
  discover,
  exchangeCode,
  randomState,
  resetOidcCaches,
  verifyIdToken,
} from '../core/oidc.js';
import { issueSession } from '../core/session.js';
import { parse } from '../core/validate.js';
import { withOrg, withoutOrg } from '../db/pool.js';

/**
 * Federerad inloggning för personal (krav C.2.4, C.2.5, C.2.6).
 *
 * Personalens lösenord och multifaktor hanteras i beställarens katalog. Här
 * kontrolleras bara att katalogen verkligen har intygat identiteten, och vilka
 * roller gruppanspråket ger. Ett konto som inte längre finns i rätt grupp får
 * ingen roll och därmed ingen åtkomst.
 */

const providerSchema = z.object({
  name: z.string().trim().min(2).max(120),
  issuer: z.string().trim().url(),
  discoveryUrl: z.string().trim().url().optional(),
  clientId: z.string().trim().min(1).max(200),
  groupsClaim: z.string().trim().min(1).max(60).optional(),
  roleMapping: z.record(z.string(), z.enum(ROLES as unknown as [Role, ...Role[]])),
  allowedDomains: z.array(z.string().trim().toLowerCase().max(120)).max(20).optional(),
  autoProvision: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

interface ProviderRow {
  id: string;
  org_id: string;
  name: string;
  issuer: string;
  discovery_url: string | null;
  client_id: string;
  client_secret: string | null;
  groups_claim: string;
  role_mapping: Record<string, Role>;
  allowed_domains: string[];
  auto_provision: boolean;
  enabled: boolean;
}

function redirectUri(): string {
  return `${config.publicApiUrl}/api/auth/sso/callback`;
}

/** Rollerna som gruppanspråket ger. Endast personalroller kan tilldelas via SSO. */
function rolesFromClaims(provider: ProviderRow, claims: Record<string, unknown>): Role[] {
  const raw = claims[provider.groups_claim];
  const groups = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [];
  const roles = new Set<Role>();
  for (const group of groups) {
    const role = provider.role_mapping[group];
    if (role && STAFF_ROLES.includes(role)) roles.add(role);
  }
  return [...roles];
}

export async function registerSsoRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------------------------ starta inloggning --- */

  app.get<{ Querystring: { org?: string; returnTo?: string } }>(
    '/api/auth/sso/start',
    async (request, reply) => {
      const slug = request.query.org?.trim();
      if (!slug) throw badRequest('Ange vilket fastighetsbolag inloggningen gäller.');

      const orgId = await withoutOrg(async (client) => {
        const result = await client.query<{ org_id: string | null }>(
          'select app.org_id_for_slug($1) as org_id',
          [slug],
        );
        return result.rows[0]?.org_id ?? null;
      });
      if (!orgId) throw notFound('Fastighetsbolaget hittades inte.');

      const url = await withOrg({ orgId }, async (client) => {
        const found = await client.query<ProviderRow>(
          'select * from sso_providers where enabled = true limit 1',
        );
        const provider = found.rows[0];
        if (!provider) {
          throw badRequest('Federerad inloggning är inte påslagen för det här bolaget.');
        }
        if (!provider.client_secret) {
          // Utan uppgifter finns ingen anslutning, och då ska inget flöde startas.
          throw badRequest('Federerad inloggning saknar autentiseringsuppgifter.');
        }

        const discovery = await discover(provider.discovery_url ?? provider.issuer);
        const state = randomState();
        const nonce = randomState();
        const pkce = createPkce();

        await client.query(
          `insert into sso_auth_requests
             (org_id, provider_id, state_hash, nonce, code_verifier, redirect_uri, return_to, ip, expires_at)
           values ($1,$2,$3,$4,$5,$6,$7,$8, now() + interval '10 minutes')`,
          [
            orgId,
            provider.id,
            hashToken(state),
            nonce,
            pkce.verifier,
            redirectUri(),
            request.query.returnTo ?? null,
            request.ip,
          ],
        );

        return authorizationUrl({
          discovery,
          clientId: provider.client_id,
          redirectUri: redirectUri(),
          state,
          nonce,
          codeChallenge: pkce.challenge,
        });
      });

      // Anropas både som omdirigering och som JSON av gränssnittet.
      if (request.headers.accept?.includes('application/json')) return { authorizationUrl: url };
      return reply.redirect(url, 302);
    },
  );

  /* ---------------------------------------------------------- callback --- */

  app.get<{ Querystring: { code?: string; state?: string; error?: string; error_description?: string } }>(
    '/api/auth/sso/callback',
    async (request, reply) => {
      const { code, state } = request.query;
      if (request.query.error) {
        throw unauthorized(`Identitetsleverantören avbröt inloggningen: ${request.query.error}.`);
      }
      if (!code || !state) throw badRequest('Svaret från identitetsleverantören var ofullständigt.');

      const stateHash = hashToken(state);
      const orgId = await withoutOrg(async (client) => {
        const result = await client.query<{ org_id: string | null }>(
          'select app.org_for_sso_state($1) as org_id',
          [stateHash],
        );
        return result.rows[0]?.org_id ?? null;
      });
      if (!orgId) throw unauthorized('Inloggningsförsöket har gått ut. Försök igen.');

      const complete = withOrg({ orgId }, async (client) => {
        // Försöket förbrukas direkt, så att samma kod inte kan lösas in två gånger.
        const claimed = await client.query<{
          id: string;
          provider_id: string;
          nonce: string;
          code_verifier: string;
          redirect_uri: string;
          return_to: string | null;
        }>(
          `update sso_auth_requests set used_at = now()
            where state_hash = $1 and used_at is null and expires_at > now()
            returning id, provider_id, nonce, code_verifier, redirect_uri, return_to`,
          [stateHash],
        );
        const attempt = claimed.rows[0];
        if (!attempt) throw unauthorized('Inloggningsförsöket har redan använts.');

        const providerResult = await client.query<ProviderRow>(
          'select * from sso_providers where id = $1',
          [attempt.provider_id],
        );
        const provider = providerResult.rows[0];
        if (!provider?.client_secret) throw unauthorized('Federerad inloggning är inte konfigurerad.');

        const discovery = await discover(provider.discovery_url ?? provider.issuer);
        const tokens = await exchangeCode({
          discovery,
          clientId: provider.client_id,
          clientSecret: provider.client_secret,
          code,
          redirectUri: attempt.redirect_uri,
          codeVerifier: attempt.code_verifier,
        });

        const claims = await verifyIdToken(tokens.id_token, {
          issuer: discovery.issuer,
          audience: provider.client_id,
          nonce: attempt.nonce,
          jwksUri: discovery.jwks_uri,
        });

        const email = (claims.email ?? claims.preferred_username ?? '').toString().toLowerCase();
        if (!email.includes('@')) {
          throw unauthorized('Katalogen lämnade ingen e-postadress att koppla kontot till.');
        }
        const domain = email.split('@')[1]!;
        if (provider.allowed_domains.length && !provider.allowed_domains.includes(domain)) {
          throw unauthorized('E-postdomänen är inte tillåten för federerad inloggning.');
        }

        const roles = rolesFromClaims(provider, claims as Record<string, unknown>);

        // Kontot söks i första hand på ämnet från katalogen, i andra hand på
        // e-postadressen – så att en befintlig användare kopplas ihop en gång.
        const existing = await client.query<{ id: string; status: string }>(
          `select id, status from users
            where sso_subject = $1 or (sso_subject is null and lower(email) = $2)
            order by (sso_subject = $1) desc limit 1`,
          [claims.sub, email],
        );
        let userId = existing.rows[0]?.id ?? null;

        if (!userId) {
          if (!provider.auto_provision) {
            throw unauthorized('Kontot finns inte upplagt. Kontakta systemadministratören.');
          }
          if (!roles.length) {
            throw unauthorized('Kontot saknar behörighetsgrupp för tjänsten.');
          }
          const created = await client.query<{ id: string }>(
            `insert into users (org_id, email, first_name, last_name, status, email_verified_at, sso_subject)
             values ($1,$2,$3,$4,'active', now(), $5) returning id`,
            [
              orgId,
              email,
              (claims.given_name as string) ?? (claims.name as string) ?? email,
              (claims.family_name as string) ?? '',
              claims.sub,
            ],
          );
          userId = created.rows[0]!.id;
        } else {
          if (existing.rows[0]!.status !== 'active') {
            throw unauthorized('Kontot är avstängt.');
          }
          await client.query(
            `update users set sso_subject = $2, email_verified_at = coalesce(email_verified_at, now()),
                              last_login_at = now()
              where id = $1`,
            [userId, claims.sub],
          );
        }

        // Rollerna sätts om vid varje inloggning, så att en ändring i katalogen
        // slår igenom här (krav C.2.13 tillämpat på personal).
        if (roles.length) {
          await client.query('delete from user_roles where user_id = $1', [userId]);
          for (const role of roles) {
            await client.query(
              'insert into user_roles (org_id, user_id, role) values ($1,$2,$3)',
              [orgId, userId, role],
            );
          }
        }

        const effective = await client.query<{ role: Role }>(
          'select role from user_roles where user_id = $1',
          [userId],
        );
        const effectiveRoles = effective.rows.map((r) => r.role);
        if (!effectiveRoles.length) {
          throw unauthorized('Kontot saknar behörighet i tjänsten.');
        }

        const session = await issueSession(client, {
          orgId,
          userId,
          roles: effectiveRoles,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });

        await client.query('update sso_providers set last_login_at = now(), last_error = null where id = $1', [
          provider.id,
        ]);

        await auditWithin(
          client,
          {
            orgId,
            actorUserId: userId,
            actorEmail: email,
            actorRoles: effectiveRoles,
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
            traceId: request.traceId,
          },
          {
            action: 'auth.login.sso',
            entityType: 'session',
            entityId: session.sessionId,
            detail: { issuer: discovery.issuer, roles: effectiveRoles },
          },
        );

        return { session, returnTo: attempt.return_to };
      });

      // Ett id-token som inte går att verifiera är ett avvisat inloggningsförsök,
      // inte ett serverfel. Orsaken loggas, men lämnas inte ut till klienten.
      const outcome = await complete.catch((error: unknown) => {
        if (error instanceof OidcError) {
          request.log.warn({ err: error, detail: error.detail }, 'federerad inloggning avvisades');
          throw unauthorized('Inloggningen kunde inte verifieras mot katalogen.');
        }
        throw error;
      });

      // Gränssnittet hämtar token via en engångsadress i stället för att få dem
      // i en URL som hamnar i webbläsarhistoriken.
      const target = new URL(config.webOrigins[0] ?? 'http://localhost:5173');
      target.pathname = '/sso';
      target.searchParams.set('token', outcome.session.accessToken);
      target.searchParams.set('refresh', outcome.session.refreshToken);
      if (outcome.returnTo) target.searchParams.set('returnTo', outcome.returnTo);

      if (request.headers.accept?.includes('application/json')) {
        return {
          accessToken: outcome.session.accessToken,
          refreshToken: outcome.session.refreshToken,
          expiresIn: outcome.session.expiresIn,
        };
      }
      return reply.redirect(target.toString(), 302);
    },
  );

  /* ------------------------------------------------------ administration --- */

  app.get('/api/staff/sso', async (request) => {
    requirePermission(request, 'org:settings');
    return db(request, async (client) => {
      const result = await client.query(
        `select id, name, issuer, discovery_url, client_id, groups_claim, role_mapping,
                allowed_domains, auto_provision, enabled, last_login_at, last_error,
                client_secret is not null as has_secret, created_at, updated_at
           from sso_providers limit 1`,
      );
      return { provider: result.rows[0] ?? null, redirectUri: redirectUri() };
    });
  });

  app.put('/api/staff/sso', async (request) => {
    const auth = requirePermission(request, 'org:settings');
    const input = parse(providerSchema, request.body);

    const saved = await db(request, async (client) => {
      const existing = await client.query<{ id: string; client_secret: string | null }>(
        'select id, client_secret from sso_providers limit 1',
      );
      // Påslag kräver att uppgifterna finns. Annars skulle registret visa en
      // inloggning som inte går att använda.
      if (input.enabled && !existing.rows[0]?.client_secret) {
        throw badRequest(
          'Federerad inloggning kan slås på först när klienthemligheten är registrerad i driftmiljön.',
        );
      }

      if (existing.rows[0]) {
        await client.query(
          `update sso_providers
              set name = $2, issuer = $3, discovery_url = $4, client_id = $5, groups_claim = $6,
                  role_mapping = $7::jsonb, allowed_domains = $8, auto_provision = $9,
                  enabled = $10, updated_at = now()
            where id = $1`,
          [
            existing.rows[0].id,
            input.name,
            input.issuer,
            input.discoveryUrl ?? null,
            input.clientId,
            input.groupsClaim ?? 'groups',
            JSON.stringify(input.roleMapping),
            input.allowedDomains ?? [],
            input.autoProvision ?? false,
            input.enabled ?? false,
          ],
        );
        return existing.rows[0].id;
      }

      const created = await client.query<{ id: string }>(
        `insert into sso_providers
           (org_id, name, issuer, discovery_url, client_id, groups_claim, role_mapping,
            allowed_domains, auto_provision, enabled, created_by)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11) returning id`,
        [
          auth.orgId,
          input.name,
          input.issuer,
          input.discoveryUrl ?? null,
          input.clientId,
          input.groupsClaim ?? 'groups',
          JSON.stringify(input.roleMapping),
          input.allowedDomains ?? [],
          input.autoProvision ?? false,
          false,
          auth.userId,
        ],
      );
      return created.rows[0]!.id;
    });

    resetOidcCaches();
    return { id: saved };
  });
}

export { OidcError };
