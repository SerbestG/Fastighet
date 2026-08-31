import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  STAFF_ROLES,
  changePasswordSchema,
  enrollMfaSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  requiresMfa,
  verifyEmailSchema,
  type Role,
} from '@hemvist/shared';
import { config } from '../config.js';
import { auditWithin } from '../core/audit.js';
import { db, requireAuth } from '../core/context.js';
import {
  generateToken,
  generateTotpSecret,
  hashPassword,
  hashToken,
  totpUri,
  verifyPassword,
  verifyTotp,
} from '../core/crypto.js';
import { AppError, badRequest, conflict, notFound, unauthorized } from '../core/errors.js';
import { issueSession, revokeSession } from '../core/session.js';
import { parse } from '../core/validate.js';
import { withOrg, withoutOrg } from '../db/pool.js';

/**
 * Autentisering.
 *
 * Personalkonton kräver alltid tvåfaktorsautentisering (krav C.2.6, C.2.11).
 * Federerad inloggning mot Microsoft Entra ID och BankID för hyresgäster är
 * förberedda i integrationsregistret men aktiveras först när avtal, certifikat
 * och konfiguration finns – de visas därför inte som möjliga inloggningssätt
 * förrän integrationen är ansluten.
 */

const MFA_SETUP_PURPOSE = 'mfa_setup';

function signPurposeToken(purpose: string, userId: string, orgId: string, ttlSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ purpose, userId, orgId, exp })).toString('base64url');
  const signature = createHmac('sha256', config.auth.jwtSecret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifyPurposeToken(
  token: string,
  purpose: string,
): { userId: string; orgId: string } | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = createHmac('sha256', config.auth.jwtSecret).update(payload).digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      purpose: string;
      userId: string;
      orgId: string;
      exp: number;
    };
    if (claims.purpose !== purpose || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: claims.userId, orgId: claims.orgId };
  } catch {
    return null;
  }
}

interface LoginUserRow {
  id: string;
  email: string;
  password_hash: string | null;
  first_name: string;
  last_name: string;
  status: string;
  email_verified_at: Date | null;
  mfa_secret: string | null;
  mfa_enabled_at: Date | null;
  failed_logins: number;
  locked_until: Date | null;
}

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  /* Publik profil för inloggningssidan: namn, färger och kontaktvägar. */
  app.get<{ Params: { slug: string } }>('/api/public/organisations/:slug', async (request) => {
    const slug = String(request.params.slug).toLowerCase();
    // Uppgifterna hämtas via en avgränsad funktion eftersom ingen organisation är
    // satt för sessionen innan användaren loggat in. Funktionen returnerar bara
    // sådant som ändå visas publikt.
    const result = await withoutOrg((client) =>
      client.query<{
        id: string;
        slug: string;
        display_name: string;
        primary_color: string;
        accent_color: string;
        support_phone: string | null;
        support_email: string | null;
        emergency_phone: string | null;
        disturbance_phone: string | null;
        website_url: string | null;
        default_locale: string;
        enabled_features: string[];
      }>('select * from app.public_organisation($1)', [slug]),
    );
    const org = result.rows[0];
    if (!org) throw notFound('Organisationen hittades inte.');
    return { organisation: org };
  });

  /** Bolag som går att logga in hos. Används av inloggningssidan. */
  app.get('/api/public/organisations', async () => {
    const result = await withoutOrg((client) =>
      client.query<{ slug: string; display_name: string; primary_color: string }>(
        'select * from app.public_organisations()',
      ),
    );
    return { organisations: result.rows };
  });

  app.post(
    '/api/auth/login',
    { config: { rateLimit: { max: config.rateLimit.authMax, timeWindow: config.rateLimit.windowMs } } },
    async (request, reply) => {
      const input = parse(loginSchema, request.body);
      const ip = request.ip;
      const userAgent = request.headers['user-agent'] ?? null;

      const candidates = await withoutOrg((client) =>
        client.query<{ org_id: string; org_slug: string }>(
          'select org_id, org_slug from app.orgs_for_login($1)',
          [input.email],
        ),
      );

      let rows = candidates.rows;
      if (input.orgSlug) rows = rows.filter((r) => r.org_slug === input.orgSlug);

      if (rows.length === 0) {
        await recordAttempt(null, input.email, ip, false, 'okänt konto');
        // Samma svar oavsett om kontot finns, så att inloggningen inte kan användas
        // för att kartlägga vilka e-postadresser som är registrerade.
        throw unauthorized('Fel e-postadress eller lösenord.');
      }
      if (rows.length > 1) {
        throw badRequest('Ange vilket bolag du vill logga in hos.', [
          { path: 'orgSlug', message: 'Adressen finns hos flera bolag.' },
        ]);
      }

      const { org_id: orgId, org_slug: orgSlug } = rows[0]!;

      return withOrg({ orgId }, async (client) => {
        const userResult = await client.query<LoginUserRow>(
          `select id, email, password_hash, first_name, last_name, status, email_verified_at,
                  mfa_secret, mfa_enabled_at, failed_logins, locked_until
             from users where lower(email) = lower($1)`,
          [input.email],
        );
        const user = userResult.rows[0];
        if (!user) {
          await recordAttempt(orgId, input.email, ip, false, 'okänt konto');
          throw unauthorized('Fel e-postadress eller lösenord.');
        }

        if (user.locked_until && user.locked_until > new Date()) {
          await auditWithin(
            client,
            { orgId, actorUserId: user.id, actorEmail: user.email, ip, userAgent, traceId: request.traceId },
            { action: 'auth.login', outcome: 'denied', detail: { reason: 'kontot är låst' } },
          );
          throw new AppError('rate_limited', 'Kontot är tillfälligt låst efter för många försök.');
        }

        const passwordOk = await verifyPassword(input.password, user.password_hash);
        if (!passwordOk) {
          const failed = user.failed_logins + 1;
          const lock = failed >= config.auth.maxFailedLogins;
          await client.query(
            `update users set failed_logins = $2,
                    locked_until = case when $3 then now() + make_interval(mins => $4) else locked_until end
              where id = $1`,
            [user.id, lock ? 0 : failed, lock, config.auth.lockoutMinutes],
          );
          await auditWithin(
            client,
            { orgId, actorUserId: user.id, actorEmail: user.email, ip, userAgent, traceId: request.traceId },
            { action: 'auth.login', outcome: 'denied', detail: { reason: 'fel lösenord', locked: lock } },
          );
          await recordAttempt(orgId, input.email, ip, false, 'fel lösenord');
          throw unauthorized('Fel e-postadress eller lösenord.');
        }

        const roleResult = await client.query<{ role: Role }>(
          'select role from user_roles where user_id = $1',
          [user.id],
        );
        const roles = roleResult.rows.map((r) => r.role);
        if (roles.length === 0) throw unauthorized('Kontot saknar behörighet.');

        const isStaff = roles.some((r) => STAFF_ROLES.includes(r));
        if (config.auth.requireVerifiedEmail && !user.email_verified_at && !isStaff) {
          throw new AppError('unauthorized', 'Bekräfta din e-postadress innan du loggar in.');
        }

        // Personal utan tvåfaktor får sätta upp den innan sessionen skapas.
        if (roles.some((r) => requiresMfa(r)) && !user.mfa_enabled_at) {
          const secret = user.mfa_secret ?? generateTotpSecret();
          if (!user.mfa_secret) {
            await client.query('update users set mfa_secret = $2 where id = $1', [user.id, secret]);
          }
          reply.status(403);
          return {
            error: {
              code: 'mfa_setup_required',
              message: 'Kontot måste ha tvåfaktorsautentisering aktiverad.',
              traceId: request.traceId,
            },
            mfaSetup: {
              setupToken: signPurposeToken(MFA_SETUP_PURPOSE, user.id, orgId, 600),
              secret,
              otpauthUri: totpUri(secret, user.email, 'Hemvist'),
            },
          };
        }

        if (user.mfa_enabled_at && user.mfa_secret) {
          if (!input.totp) {
            reply.status(401);
            return {
              error: {
                code: 'mfa_required',
                message: 'Ange engångskoden från din autentiseringsapp.',
                traceId: request.traceId,
              },
            };
          }
          if (!verifyTotp(user.mfa_secret, input.totp)) {
            await auditWithin(
              client,
              { orgId, actorUserId: user.id, actorEmail: user.email, ip, userAgent, traceId: request.traceId },
              { action: 'auth.login', outcome: 'denied', detail: { reason: 'fel engångskod' } },
            );
            throw unauthorized('Fel engångskod.');
          }
        }

        const session = await issueSession(client, { orgId, userId: user.id, roles, ip, userAgent });
        await client.query(
          'update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = $1',
          [user.id],
        );
        await auditWithin(
          client,
          { orgId, actorUserId: user.id, actorEmail: user.email, actorRoles: roles, ip, userAgent, traceId: request.traceId },
          { action: 'auth.login', entityType: 'session', entityId: session.sessionId },
        );
        await recordAttempt(orgId, input.email, ip, true, null);

        return {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            roles,
            orgSlug,
          },
        };
      });
    },
  );

  app.post('/api/auth/mfa/enroll', async (request) => {
    const body = request.body as { setupToken?: string } | undefined;
    const input = parse(enrollMfaSchema, request.body);
    const claims = body?.setupToken ? verifyPurposeToken(body.setupToken, MFA_SETUP_PURPOSE) : null;

    if (claims) {
      return withOrg({ orgId: claims.orgId }, async (client) => {
        const result = await client.query<{ mfa_secret: string | null; email: string }>(
          'select mfa_secret, email from users where id = $1',
          [claims.userId],
        );
        const row = result.rows[0];
        if (!row?.mfa_secret || !verifyTotp(row.mfa_secret, input.totp)) {
          throw unauthorized('Fel engångskod.');
        }
        await client.query('update users set mfa_enabled_at = now() where id = $1', [claims.userId]);
        const roles = (
          await client.query<{ role: Role }>('select role from user_roles where user_id = $1', [
            claims.userId,
          ])
        ).rows.map((r) => r.role);
        const session = await issueSession(client, {
          orgId: claims.orgId,
          userId: claims.userId,
          roles,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
        });
        await auditWithin(
          client,
          { orgId: claims.orgId, actorUserId: claims.userId, actorEmail: row.email, ip: request.ip, traceId: request.traceId },
          { action: 'auth.mfa_enrolled', entityType: 'user', entityId: claims.userId },
        );
        return {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
        };
      });
    }

    // Inloggad användare som aktiverar tvåfaktor frivilligt.
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query<{ mfa_secret: string | null }>(
        'select mfa_secret from users where id = $1',
        [auth.userId],
      );
      const secret = result.rows[0]?.mfa_secret;
      if (!secret || !verifyTotp(secret, input.totp)) throw unauthorized('Fel engångskod.');
      await client.query('update users set mfa_enabled_at = now() where id = $1', [auth.userId]);
      await auditWithin(
        client,
        { orgId: auth.orgId, actorUserId: auth.userId, actorEmail: auth.email, ip: request.ip, traceId: request.traceId },
        { action: 'auth.mfa_enrolled', entityType: 'user', entityId: auth.userId },
      );
      return { enabled: true };
    });
  });

  app.post('/api/auth/mfa/setup', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const secret = generateTotpSecret();
      await client.query(
        'update users set mfa_secret = $2, mfa_enabled_at = null where id = $1',
        [auth.userId, secret],
      );
      return { secret, otpauthUri: totpUri(secret, auth.email, 'Hemvist') };
    });
  });

  app.post('/api/auth/refresh', async (request) => {
    const input = parse(refreshSchema, request.body);
    const tokenHash = hashToken(input.refreshToken);
    const orgResult = await withoutOrg((client) =>
      client.query<{ org_for_refresh_token: string | null }>(
        'select app.org_for_refresh_token($1)',
        [tokenHash],
      ),
    );
    const orgId = orgResult.rows[0]?.org_for_refresh_token;
    if (!orgId) throw unauthorized('Sessionen har upphört. Logga in igen.');

    return withOrg({ orgId }, async (client) => {
      const sessionResult = await client.query<{
        id: string;
        user_id: string;
        idle_expires_at: Date;
      }>(
        `select id, user_id, idle_expires_at from sessions
          where refresh_token_hash = $1 and revoked_at is null and expires_at > now()`,
        [tokenHash],
      );
      const session = sessionResult.rows[0];
      if (!session || session.idle_expires_at <= new Date()) {
        throw unauthorized('Sessionen har upphört. Logga in igen.');
      }
      const roles = (
        await client.query<{ role: Role }>('select role from user_roles where user_id = $1', [
          session.user_id,
        ])
      ).rows.map((r) => r.role);

      // Uppdateringstoken byts vid varje användning, så att en läckt token bara
      // kan användas en gång och stölden syns när originalet slutar fungera.
      await revokeSession(client, session.id, 'rotated');
      const next = await issueSession(client, {
        orgId,
        userId: session.user_id,
        roles,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });
      return {
        accessToken: next.accessToken,
        refreshToken: next.refreshToken,
        expiresIn: next.expiresIn,
      };
    });
  });

  app.post('/api/auth/logout', async (request) => {
    const auth = request.auth;
    if (!auth) return { ok: true };
    await db(request, async (client) => {
      await revokeSession(client, auth.sessionId, 'user_logout');
      await auditWithin(
        client,
        { orgId: auth.orgId, actorUserId: auth.userId, actorEmail: auth.email, ip: request.ip, traceId: request.traceId },
        { action: 'auth.logout', entityType: 'session', entityId: auth.sessionId },
      );
    });
    return { ok: true };
  });

  app.post(
    '/api/auth/register',
    { config: { rateLimit: { max: config.rateLimit.authMax, timeWindow: config.rateLimit.windowMs } } },
    async (request) => {
      const input = parse(registerSchema, request.body);
      const orgResult = await withoutOrg((client) =>
        client.query<{ org_id_for_slug: string | null }>('select app.org_id_for_slug($1)', [
          input.orgSlug,
        ]),
      );
      const orgId = orgResult.rows[0]?.org_id_for_slug;
      if (!orgId) throw badRequest('Okänt bolag.', [{ path: 'orgSlug', message: 'Bolaget hittades inte.' }]);

      return withOrg({ orgId }, async (client) => {
        const invitationResult = await client.query<{
          id: string;
          tenancy_id: string | null;
          role: 'tenant' | 'co_resident';
          email: string | null;
        }>(
          `select id, tenancy_id, role, email from invitations
            where code_hash = $1 and used_at is null and expires_at > now()
            for update`,
          [hashToken(input.invitationCode.trim().toUpperCase())],
        );
        const invitation = invitationResult.rows[0];
        if (!invitation) {
          throw badRequest('Inbjudningskoden gäller inte.', [
            { path: 'invitationCode', message: 'Koden är felaktig eller har använts.' },
          ]);
        }
        if (invitation.email && invitation.email.toLowerCase() !== input.email) {
          throw badRequest('Koden gäller en annan e-postadress.', [
            { path: 'email', message: 'Adressen stämmer inte med inbjudan.' },
          ]);
        }

        const existing = await client.query('select 1 from users where lower(email) = lower($1)', [
          input.email,
        ]);
        if (existing.rowCount) throw conflict('Det finns redan ett konto med den e-postadressen.');

        const userResult = await client.query<{ id: string }>(
          `insert into users (org_id, email, password_hash, first_name, last_name, phone, locale,
                              status, password_changed_at)
           values ($1,$2,$3,$4,$5,$6,$7,'active',now()) returning id`,
          [
            orgId,
            input.email,
            await hashPassword(input.password),
            input.firstName,
            input.lastName,
            input.phone ?? null,
            input.locale,
          ],
        );
        const userId = userResult.rows[0]!.id;
        await client.query('insert into user_roles (org_id, user_id, role) values ($1,$2,$3)', [
          orgId,
          userId,
          invitation.role,
        ]);
        if (invitation.tenancy_id) {
          await client.query(
            `insert into tenancy_residents (org_id, tenancy_id, user_id, role, is_primary, moved_in_at)
             values ($1,$2,$3,$4,false, current_date)
             on conflict (tenancy_id, user_id) do nothing`,
            [orgId, invitation.tenancy_id, userId, invitation.role],
          );
        }
        await client.query('update invitations set used_at = now(), used_by = $2 where id = $1', [
          invitation.id,
          userId,
        ]);

        const token = generateToken(32);
        await client.query(
          `insert into email_verifications (org_id, user_id, token_hash, expires_at)
           values ($1,$2,$3, now() + interval '7 days')`,
          [orgId, userId, hashToken(token)],
        );

        await auditWithin(
          client,
          { orgId, actorUserId: userId, actorEmail: input.email, ip: request.ip, traceId: request.traceId },
          { action: 'auth.register', entityType: 'user', entityId: userId },
        );

        return {
          userId,
          verificationRequired: config.auth.requireVerifiedEmail,
          // Utan konfigurerad e-postintegration finns ingen väg att skicka länken.
          // Den returneras därför i utvecklings- och testläge, aldrig i produktion.
          verificationToken: config.isProduction ? undefined : token,
        };
      });
    },
  );

  app.post('/api/auth/verify-email', async (request) => {
    const input = parse(verifyEmailSchema, request.body);
    const tokenHash = hashToken(input.token);
    const orgResult = await withoutOrg((client) =>
      client.query<{ org_for_email_verification: string | null }>(
        'select app.org_for_email_verification($1)',
        [tokenHash],
      ),
    );
    const orgId = orgResult.rows[0]?.org_for_email_verification;
    if (!orgId) throw badRequest('Länken gäller inte längre.');

    return withOrg({ orgId }, async (client) => {
      const result = await client.query<{ user_id: string }>(
        `update email_verifications set used_at = now()
          where token_hash = $1 and used_at is null and expires_at > now()
          returning user_id`,
        [tokenHash],
      );
      const userId = result.rows[0]?.user_id;
      if (!userId) throw badRequest('Länken gäller inte längre.');
      await client.query('update users set email_verified_at = now() where id = $1', [userId]);
      await auditWithin(
        client,
        { orgId, actorUserId: userId, ip: request.ip, traceId: request.traceId },
        { action: 'auth.email_verified', entityType: 'user', entityId: userId },
      );
      return { verified: true };
    });
  });

  app.post('/api/auth/password', async (request) => {
    const auth = requireAuth(request);
    const input = parse(changePasswordSchema, request.body);
    return db(request, async (client) => {
      const result = await client.query<{ password_hash: string | null }>(
        'select password_hash from users where id = $1',
        [auth.userId],
      );
      const ok = await verifyPassword(input.currentPassword, result.rows[0]?.password_hash ?? null);
      if (!ok) throw unauthorized('Nuvarande lösenord stämmer inte.');
      await client.query(
        'update users set password_hash = $2, password_changed_at = now() where id = $1',
        [auth.userId, await hashPassword(input.newPassword)],
      );
      // Alla andra sessioner avslutas när lösenordet byts.
      await client.query(
        `update sessions set revoked_at = now(), revoked_reason = 'password_changed'
          where user_id = $1 and id <> $2 and revoked_at is null`,
        [auth.userId, auth.sessionId],
      );
      await auditWithin(
        client,
        { orgId: auth.orgId, actorUserId: auth.userId, actorEmail: auth.email, ip: request.ip, traceId: request.traceId },
        { action: 'auth.password_changed', entityType: 'user', entityId: auth.userId },
      );
      return { ok: true };
    });
  });

  app.get('/api/auth/sessions', async (request) => {
    const auth = requireAuth(request);
    return db(request, async (client) => {
      const result = await client.query(
        `select id, user_agent, ip::text, created_at, last_seen_at, expires_at,
                (id = $2) as current
           from sessions
          where user_id = $1 and revoked_at is null and expires_at > now()
          order by last_seen_at desc`,
        [auth.userId, auth.sessionId],
      );
      return { sessions: result.rows };
    });
  });
}

async function recordAttempt(
  orgId: string | null,
  email: string,
  ip: string,
  successful: boolean,
  reason: string | null,
): Promise<void> {
  try {
    await withoutOrg((client) =>
      client.query(
        'insert into login_attempts (org_id, email, ip, successful, reason) values ($1,$2,$3,$4,$5)',
        [orgId, email, ip, successful, reason],
      ),
    );
  } catch {
    // Loggningen får aldrig blockera inloggningsflödet.
  }
}
