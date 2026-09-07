import type { FastifyInstance } from 'fastify';
import type { Role } from '@hemvist/shared';
import { z } from 'zod';
import { auditWithin } from '../core/audit.js';
import {
  BankIdError,
  bankIdClient,
  qrCode,
} from '../core/bankid.js';
import { generateToken, hashToken, lookupHash } from '../core/crypto.js';
import { badRequest, notFound, unauthorized } from '../core/errors.js';
import { issueSession } from '../core/session.js';
import { parse } from '../core/validate.js';
import { withOrg, withoutOrg } from '../db/pool.js';

/**
 * Inloggning med BankID (krav C.2.1, C.2.2).
 *
 * Servern håller BankID:s orderreferens för sig själv och lämnar ut en egen
 * referens till klienten. Personnumret som BankID intygar matchas mot en
 * pepprad hash på kundposten – det lagras aldrig i klartext och skrivs aldrig
 * i loggen.
 */

const startSchema = z.object({
  org: z.string().trim().min(1).max(80),
  /**
   * Endast i simulatorläge: vilket demokonto som ska legitimeras. Ignoreras
   * fullständigt när en riktig BankID-anslutning finns.
   */
  demoPersonalNumber: z.string().trim().max(20).optional(),
});

const refSchema = z.object({ ref: z.string().trim().min(10).max(200) });

/** Klartexten normaliseras innan den hashas, så att format inte spelar roll. */
function normalisePersonalNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 12) return digits;
  if (digits.length === 10) {
    // BankID lämnar alltid tolv siffror; tio hanteras för robusthet.
    const year = Number(digits.slice(0, 2));
    const century = year > new Date().getFullYear() % 100 ? '19' : '20';
    return `${century}${digits}`;
  }
  return digits;
}

export async function registerBankIdRoutes(app: FastifyInstance): Promise<void> {
  /* ------------------------------------------------------------- start --- */

  app.post('/api/auth/bankid/start', async (request) => {
    const input = parse(startSchema, request.body);

    const orgId = await withoutOrg(async (client) => {
      const result = await client.query<{ org_id: string | null }>(
        'select app.org_id_for_slug($1) as org_id',
        [input.org],
      );
      return result.rows[0]?.org_id ?? null;
    });
    if (!orgId) throw notFound('Fastighetsbolaget hittades inte.');

    return withOrg({ orgId }, async (client) => {
      const enabled = await client.query<{ status: string }>(
        `select status from integrations where kind = 'bankid'`,
      );
      const status = enabled.rows[0]?.status;
      if (status !== 'connected' && status !== 'sandbox') {
        throw badRequest('BankID är inte påslaget för det här bolaget.');
      }

      const bankid = bankIdClient();
      if (!bankid) throw badRequest('BankID saknar anslutning.');

      const order = await bankid.auth({
        endUserIp: request.ip,
        // Uppgiften används bara av simulatorn. Den riktiga klienten hämtar
        // identiteten från BankID och bryr sig inte om vad anroparen påstår.
        demoIdentity: {
          personalNumber: normalisePersonalNumber(input.demoPersonalNumber ?? ''),
          name: 'Demoperson',
        },
      });
      const sessionRef = generateToken(24);

      await client.query(
        `insert into bankid_orders
           (org_id, session_ref_hash, order_ref, auto_start_token, qr_start_token, qr_start_secret,
            ip, expires_at)
         values ($1,$2,$3,$4,$5,$6,$7, now() + interval '5 minutes')`,
        [
          orgId,
          hashToken(sessionRef),
          order.orderRef,
          order.autoStartToken,
          order.qrStartToken,
          order.qrStartSecret,
          request.ip,
        ],
      );

      return {
        ref: sessionRef,
        autoStartToken: order.autoStartToken,
        qr: qrCode(order.qrStartToken, order.qrStartSecret, 0),
        mode: bankid.mode,
      };
    });
  });

  /* ----------------------------------------------------------- QR-kod --- */

  app.get<{ Querystring: { ref?: string } }>('/api/auth/bankid/qr', async (request) => {
    const ref = parse(refSchema, { ref: request.query.ref }).ref;
    const refHash = hashToken(ref);
    const orgId = await withoutOrg(async (client) => {
      const result = await client.query<{ org_id: string | null }>(
        'select app.org_for_bankid_order($1) as org_id',
        [refHash],
      );
      return result.rows[0]?.org_id ?? null;
    });
    if (!orgId) throw notFound('Inloggningen har gått ut.');

    return withOrg({ orgId }, async (client) => {
      const result = await client.query<{
        qr_start_token: string;
        qr_start_secret: string;
        started_at: Date;
        status: string;
      }>(
        'select qr_start_token, qr_start_secret, started_at, status from bankid_orders where session_ref_hash = $1',
        [refHash],
      );
      const order = result.rows[0];
      if (!order) throw notFound('Inloggningen har gått ut.');
      if (order.status !== 'pending') return { qr: null, status: order.status };

      const seconds = Math.floor((Date.now() - order.started_at.getTime()) / 1000);
      return {
        qr: qrCode(order.qr_start_token, order.qr_start_secret, seconds),
        status: order.status,
      };
    });
  });

  /* ---------------------------------------------------------- collect --- */

  app.post('/api/auth/bankid/collect', async (request) => {
    const { ref } = parse(refSchema, request.body);
    const refHash = hashToken(ref);

    const orgId = await withoutOrg(async (client) => {
      const result = await client.query<{ org_id: string | null }>(
        'select app.org_for_bankid_order($1) as org_id',
        [refHash],
      );
      return result.rows[0]?.org_id ?? null;
    });
    if (!orgId) throw notFound('Inloggningen har gått ut.');

    return withOrg({ orgId }, async (client) => {
      const found = await client.query<{
        id: string;
        order_ref: string;
        status: string;
      }>('select id, order_ref, status from bankid_orders where session_ref_hash = $1', [refHash]);
      const order = found.rows[0];
      if (!order) throw notFound('Inloggningen har gått ut.');
      if (order.status !== 'pending') {
        return { status: order.status, hintCode: null, session: null };
      }

      const bankid = bankIdClient();
      if (!bankid) throw badRequest('BankID saknar anslutning.');

      let result;
      try {
        result = await bankid.collect(order.order_ref);
      } catch (error) {
        const detail = error instanceof BankIdError ? error.detail : undefined;
        request.log.warn({ detail }, 'BankID svarade med fel');
        await client.query(
          `update bankid_orders set status = 'failed', failure_reason = 'transport', completed_at = now()
            where id = $1`,
          [order.id],
        );
        return { status: 'failed', hintCode: 'transport', session: null };
      }

      if (result.status === 'pending') {
        await client.query('update bankid_orders set hint_code = $2 where id = $1', [
          order.id,
          result.hintCode ?? null,
        ]);
        return { status: 'pending', hintCode: result.hintCode ?? null, session: null };
      }

      if (result.status !== 'complete' || !result.completionData) {
        await client.query(
          `update bankid_orders set status = 'failed', hint_code = $2, completed_at = now() where id = $1`,
          [order.id, result.hintCode ?? null],
        );
        return { status: 'failed', hintCode: result.hintCode ?? null, session: null };
      }

      // Personnumret används bara för att slå upp kundposten och lämnar aldrig
      // den här funktionen. Hashen är pepprad, så listan går inte att gissa sig till.
      const personalNumber = normalisePersonalNumber(result.completionData.user.personalNumber);
      const match = await client.query<{ id: string; status: string }>(
        `select id, status from users
          where personal_number_hash = $1 and account_type = 'person'`,
        [lookupHash(personalNumber)],
      );
      const user = match.rows[0];

      if (!user) {
        await client.query(
          `update bankid_orders set status = 'failed', failure_reason = 'no_account', completed_at = now()
            where id = $1`,
          [order.id],
        );
        await auditWithin(
          client,
          {
            orgId,
            ip: request.ip,
            userAgent: request.headers['user-agent'] ?? null,
            traceId: request.traceId,
          },
          {
            action: 'auth.login.bankid',
            outcome: 'denied',
            // Personnumret loggas aldrig, bara att ingen kundpost matchade.
            detail: { reason: 'ingen matchande kundpost' },
          },
        );
        throw unauthorized(
          'Legitimeringen lyckades, men det finns ingen kund med det personnumret hos bolaget.',
        );
      }
      if (user.status !== 'active') {
        await client.query(
          `update bankid_orders set status = 'failed', failure_reason = 'inactive', completed_at = now()
            where id = $1`,
          [order.id],
        );
        throw unauthorized('Kontot är inte aktivt.');
      }

      const roleResult = await client.query<{ role: Role }>(
        'select role from user_roles where user_id = $1',
        [user.id],
      );
      const roles = roleResult.rows.map((r) => r.role);
      if (!roles.length) throw unauthorized('Kontot saknar behörighet i tjänsten.');

      const session = await issueSession(client, {
        orgId,
        userId: user.id,
        roles,
        ip: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      });

      await client.query(
        `update bankid_orders set status = 'complete', user_id = $2, completed_at = now() where id = $1`,
        [order.id, user.id],
      );
      await client.query('update users set last_login_at = now() where id = $1', [user.id]);

      await auditWithin(
        client,
        {
          orgId,
          actorUserId: user.id,
          actorRoles: roles,
          ip: request.ip,
          userAgent: request.headers['user-agent'] ?? null,
          traceId: request.traceId,
        },
        {
          action: 'auth.login.bankid',
          entityType: 'session',
          entityId: session.sessionId,
          detail: { mode: bankid.mode },
        },
      );

      return {
        status: 'complete' as const,
        hintCode: null,
        session: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          expiresIn: session.expiresIn,
        },
      };
    });
  });

  /* ----------------------------------------------------------- avbryt --- */

  app.post('/api/auth/bankid/cancel', async (request) => {
    const { ref } = parse(refSchema, request.body);
    const refHash = hashToken(ref);
    const orgId = await withoutOrg(async (client) => {
      const result = await client.query<{ org_id: string | null }>(
        'select app.org_for_bankid_order($1) as org_id',
        [refHash],
      );
      return result.rows[0]?.org_id ?? null;
    });
    if (!orgId) return { ok: true };

    await withOrg({ orgId }, async (client) => {
      const found = await client.query<{ id: string; order_ref: string; status: string }>(
        'select id, order_ref, status from bankid_orders where session_ref_hash = $1',
        [refHash],
      );
      const order = found.rows[0];
      if (!order || order.status !== 'pending') return;

      const bankid = bankIdClient();
      if (bankid) {
        await bankid.cancel(order.order_ref).catch(() => {
          // Ordern kan redan ha löpt ut hos BankID. Den stängs ändå här.
        });
      }
      await client.query(
        `update bankid_orders set status = 'cancelled', completed_at = now() where id = $1`,
        [order.id],
      );
    });

    return { ok: true };
  });
}
