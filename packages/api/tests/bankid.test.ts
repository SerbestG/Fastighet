import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { qrCode } from '../src/core/bankid.js';
import { demoPersonalNumber } from '../src/db/seed.js';
import { createAdminPool } from '../src/db/pool.js';
import { ACCOUNTS, getApp } from './helpers.js';

/**
 * Inloggning med BankID (krav C.2.1, C.2.2).
 *
 * Testerna körs mot simulatorn, som inte identifierar någon. Det som prövas är
 * plattformens del: att ordern hanteras rätt, att personnumret matchas mot rätt
 * kundpost utan att lagras i klartext, att QR-koden räknas fram enligt
 * specifikationen och att ett personnummer utan kundpost inte ger åtkomst.
 */

async function post(url: string, payload: unknown) {
  const app = await getApp();
  const response = await app.inject({ method: 'POST', url, payload });
  return { status: response.statusCode, body: response.json() as Record<string, unknown> };
}

async function start(personalNumber?: string) {
  return post('/api/auth/bankid/start', {
    org: ACCOUNTS.orgA.slug,
    demoPersonalNumber: personalNumber,
  });
}

describe('Inloggning med BankID', () => {
  it('QR-koden följer BankID:s beräkning', () => {
    const token = 'qr-start-token';
    const secret = 'qr-start-secret';
    const expected = createHmac('sha256', secret).update('7').digest('hex');
    expect(qrCode(token, secret, 7)).toBe(`bankid.${token}.7.${expected}`);
    // Koden byts varje sekund.
    expect(qrCode(token, secret, 7)).not.toBe(qrCode(token, secret, 8));
  });

  it('startar en order och lämnar ut en egen referens, inte BankID:s', async () => {
    const started = await start(demoPersonalNumber(ACCOUNTS.orgA.tenant));
    expect(started.status).toBe(200);
    expect(started.body.mode).toBe('simulator');
    expect(typeof started.body.ref).toBe('string');
    expect(String(started.body.qr)).toMatch(/^bankid\./);

    const pool = createAdminPool();
    try {
      const rows = await pool.query<{ order_ref: string; session_ref_hash: string }>(
        'select order_ref, session_ref_hash from bankid_orders order by started_at desc limit 1',
      );
      // Klientens referens är inte BankID:s orderreferens, och lagras hashad.
      expect(rows.rows[0]!.order_ref).not.toBe(started.body.ref);
      expect(rows.rows[0]!.session_ref_hash).not.toBe(started.body.ref);
    } finally {
      await pool.end();
    }
  });

  it('loggar in hyresgästen när personnumret matchar en kundpost', async () => {
    const started = await start(demoPersonalNumber(ACCOUNTS.orgA.tenant));
    const ref = started.body.ref as string;

    const first = await post('/api/auth/bankid/collect', { ref });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('pending');

    const second = await post('/api/auth/bankid/collect', { ref });
    expect(second.body.status).toBe('complete');
    const session = second.body.session as { accessToken: string };
    expect(session.accessToken).toBeDefined();

    const app = await getApp();
    const me = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { user: { email: string } }).user.email).toBe(ACCOUNTS.orgA.tenant);
  });

  it('ger ingen åtkomst när personnumret saknar kundpost', async () => {
    const started = await start('190001010000');
    const ref = started.body.ref as string;
    await post('/api/auth/bankid/collect', { ref });
    const result = await post('/api/auth/bankid/collect', { ref });
    expect(result.status).toBe(401);
  });

  it('ett personnummer från ett bolag loggar inte in hos det andra', async () => {
    // Hyresgästen finns hos bolag B, men ordern startas hos bolag A.
    const started = await post('/api/auth/bankid/start', {
      org: ACCOUNTS.orgA.slug,
      demoPersonalNumber: demoPersonalNumber(ACCOUNTS.orgB.tenant),
    });
    const ref = started.body.ref as string;
    await post('/api/auth/bankid/collect', { ref });
    const result = await post('/api/auth/bankid/collect', { ref });
    expect(result.status).toBe(401);
  });

  it('QR-koden slutar lämnas ut när ordern är klar', async () => {
    const started = await start(demoPersonalNumber(ACCOUNTS.orgA.tenant));
    const ref = started.body.ref as string;
    const app = await getApp();

    const during = await app.inject({ method: 'GET', url: `/api/auth/bankid/qr?ref=${ref}` });
    expect((during.json() as { qr: string | null }).qr).toMatch(/^bankid\./);

    await post('/api/auth/bankid/collect', { ref });
    await post('/api/auth/bankid/collect', { ref });

    const after = await app.inject({ method: 'GET', url: `/api/auth/bankid/qr?ref=${ref}` });
    expect((after.json() as { qr: string | null; status: string }).qr).toBeNull();
    expect((after.json() as { status: string }).status).toBe('complete');
  });

  it('en avbruten order kan inte fullföljas', async () => {
    const started = await start(demoPersonalNumber(ACCOUNTS.orgA.tenant));
    const ref = started.body.ref as string;
    const cancelled = await post('/api/auth/bankid/cancel', { ref });
    expect(cancelled.status).toBe(200);

    const result = await post('/api/auth/bankid/collect', { ref });
    expect(result.body.status).toBe('cancelled');
    expect(result.body.session).toBeNull();
  });

  it('okänd referens avvisas', async () => {
    const result = await post('/api/auth/bankid/collect', { ref: 'x'.repeat(40) });
    expect(result.status).toBe(404);
  });

  it('personnumret lagras aldrig i klartext', async () => {
    const pool = createAdminPool();
    try {
      const number = demoPersonalNumber(ACCOUNTS.orgA.tenant);
      const rows = await pool.query<{ count: number }>(
        `select count(*)::int as count from users where personal_number_hash = $1`,
        [number],
      );
      expect(rows.rows[0]!.count).toBe(0);

      const stored = await pool.query<{ personal_number_hash: string | null }>(
        'select personal_number_hash from users where lower(email) = $1',
        [ACCOUNTS.orgA.tenant],
      );
      expect(stored.rows[0]!.personal_number_hash).toBeTruthy();
      expect(stored.rows[0]!.personal_number_hash).not.toContain(number);
    } finally {
      await pool.end();
    }
  });

  it('säkerhetsloggen redovisar försöket utan att röja personnumret', async () => {
    const pool = createAdminPool();
    try {
      const rows = await pool.query<{ detail: unknown }>(
        `select detail from audit_log where action = 'auth.login.bankid' order by at desc limit 5`,
      );
      expect(rows.rowCount).toBeGreaterThan(0);
      const text = JSON.stringify(rows.rows);
      expect(text).not.toContain(demoPersonalNumber(ACCOUNTS.orgA.tenant));
    } finally {
      await pool.end();
    }
  });
});
