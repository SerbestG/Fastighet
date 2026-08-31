import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, closeApp, get, getApp, login, post, type Session } from './helpers.js';
import { inspect } from '../src/core/files.js';
import { scrub } from '../src/core/audit.js';
import { hashPassword, verifyPassword, verifyTotp, generateTotpSecret, totpCode } from '../src/core/crypto.js';

describe('Säkerhet', () => {
  let tenant: Session;

  beforeAll(async () => {
    tenant = await login(ACCOUNTS.orgA.tenant);
  });

  afterAll(async () => {
    await closeApp();
  });

  describe('filhantering', () => {
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001',
      'hex',
    );

    it('godkänner en riktig PNG', () => {
      expect(inspect(png, 'image/png', 'bild.png')).toBe('image/png');
    });

    it('avvisar ett skript som utger sig för att vara en bild', () => {
      const evil = Buffer.from('<?php system($_GET["c"]); ?>');
      expect(() => inspect(evil, 'image/png', 'bild.png')).toThrow(/bild eller ett dokument/);
    });

    it('avvisar en fil vars innehåll inte matchar den angivna typen', () => {
      expect(() => inspect(png, 'application/pdf', 'dokument.pdf')).toThrow(/stämmer inte överens/);
    });

    it('avvisar en filtyp som inte är tillåten', () => {
      const zip = Buffer.from('504b0304140000000800', 'hex');
      expect(() => inspect(zip, 'application/zip', 'arkiv.zip')).toThrow(/inte tillåten/);
    });

    it('avvisar en tom fil', () => {
      expect(() => inspect(Buffer.alloc(0), 'image/png', 'tom.png')).toThrow(/tom/);
    });
  });

  describe('loggning', () => {
    it('tar bort lösenord, tokens och nycklar ur loggdetaljer', () => {
      const scrubbed = scrub({
        email: 'a@b.se',
        password: 'hemligt',
        refreshToken: 'abc123',
        nested: { apiKey: 'nyckel', personalNumber: '19900101-1234', ok: 'behålls' },
      }) as Record<string, unknown>;

      expect(scrubbed.email).toBe('a@b.se');
      expect(scrubbed.password).toBe('[borttaget]');
      expect(scrubbed.refreshToken).toBe('[borttaget]');
      const nested = scrubbed.nested as Record<string, unknown>;
      expect(nested.apiKey).toBe('[borttaget]');
      expect(nested.personalNumber).toBe('[borttaget]');
      expect(nested.ok).toBe('behålls');
    });
  });

  describe('lösenord och engångskoder', () => {
    it('lagrar lösenord som en saltad hash', async () => {
      const hash = await hashPassword('ettLångtLösenord123');
      expect(hash).not.toContain('ettLångtLösenord123');
      expect(hash.startsWith('scrypt$')).toBe(true);
      expect(await verifyPassword('ettLångtLösenord123', hash)).toBe(true);
      expect(await verifyPassword('felLösenord', hash)).toBe(false);
    });

    it('två hashar av samma lösenord är olika', async () => {
      expect(await hashPassword('samma')).not.toBe(await hashPassword('samma'));
    });

    it('godkänner en giltig engångskod och avvisar en felaktig', () => {
      const secret = generateTotpSecret();
      const code = totpCode(secret, Math.floor(Date.now() / 1000 / 30));
      expect(verifyTotp(secret, code)).toBe(true);
      expect(verifyTotp(secret, '000000')).toBe(false);
      expect(verifyTotp(secret, 'abcdef')).toBe(false);
    });
  });

  describe('sessioner', () => {
    it('byter uppdateringstoken vid varje förnyelse', async () => {
      const app = await getApp();
      const first = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: tenant.refreshToken },
      });
      expect(first.statusCode).toBe(200);
      const rotated = first.json() as { accessToken: string; refreshToken: string };
      expect(rotated.refreshToken).not.toBe(tenant.refreshToken);

      // Den gamla token går inte att använda igen.
      const reuse = await app.inject({
        method: 'POST',
        url: '/api/auth/refresh',
        payload: { refreshToken: tenant.refreshToken },
      });
      expect(reuse.statusCode).toBe(401);

      // Förnyelsen skapar en ny session; den gamla åtkomsttoken slutar gälla.
      const app2 = await getApp();
      const oldToken = await app2.inject({ method: 'GET', url: '/api/me', headers: tenant.headers });
      expect(oldToken.statusCode).toBe(401);

      tenant.refreshToken = rotated.refreshToken;
      tenant.accessToken = rotated.accessToken;
      tenant.headers = { authorization: `Bearer ${rotated.accessToken}` };
    });

    it('lösenordsbyte avslutar övriga sessioner', async () => {
      const other = await login(ACCOUNTS.orgA.otherTenant);
      const second = await login(ACCOUNTS.orgA.otherTenant);

      const changed = await post(second, '/api/auth/password', {
        currentPassword: 'Demolosenord123!',
        newPassword: 'EttNyttLösenord123!',
      });
      expect(changed.status).toBe(200);

      // Den första sessionen är avslutad, den som bytte lösenord är kvar.
      expect((await get(other, '/api/me')).status).toBe(401);
      expect((await get(second, '/api/me')).status).toBe(200);

      // Återställ lösenordet så att övriga tester inte påverkas.
      await post(second, '/api/auth/password', {
        currentPassword: 'EttNyttLösenord123!',
        newPassword: 'Demolosenord123!',
      });
    });

    it('utloggning gör åtkomsttoken oanvändbar', async () => {
      const session = await login(ACCOUNTS.orgA.tenant);
      expect((await get(session, '/api/me')).status).toBe(200);
      await post(session, '/api/auth/logout');
      expect((await get(session, '/api/me')).status).toBe(401);
    });
  });

  describe('felhantering', () => {
    it('varje fel har kod, begripligt meddelande och spårnings-ID', async () => {
      const app = await getApp();
      const response = await app.inject({ method: 'GET', url: '/api/finns-inte' });
      const body = response.json() as { error: { code: string; message: string; traceId: string } };
      expect(response.statusCode).toBe(404);
      expect(body.error.code).toBe('not_found');
      expect(body.error.message).toMatch(/hittades inte/i);
      expect(body.error.traceId).toBeTruthy();
      expect(response.headers['x-trace-id']).toBe(body.error.traceId);
    });

    it('valideringsfel pekar ut rätt fält', async () => {
      const result = await post<{ error: { code: string; issues: { path: string }[] } }>(tenant, '/api/cases', {
        locationKind: 'residence',
        categoryKey: 'water_drainage',
        subcategoryKey: 'leak',
        description: 'x',
      });
      expect(result.status).toBe(400);
      expect(result.body.error.code).toBe('validation_error');
      expect(result.body.error.issues.some((issue) => issue.path === 'description')).toBe(true);
    });

    it('obesvarade obligatoriska följdfrågor stoppar anmälan', async () => {
      const result = await post<{ error: { issues: { path: string }[] } }>(tenant, '/api/cases', {
        locationKind: 'residence',
        categoryKey: 'water_drainage',
        subcategoryKey: 'leak',
        description: 'Det läcker under handfatet i badrummet.',
        triageAnswers: {},
      });
      expect(result.status).toBe(400);
      expect(result.body.error.issues.map((issue) => issue.path)).toContain('triageAnswers.ongoing');
    });

    it('interna detaljer läcker inte i felsvar', async () => {
      const app = await getApp();
      const response = await app.inject({
        method: 'GET',
        url: '/api/cases/inte-ett-uuid',
        headers: tenant.headers,
      });
      expect(response.body).not.toMatch(/select |from cases|pg_|stack/i);
    });
  });

  describe('inloggning', () => {
    it('svarar likadant för okänt konto som för fel lösenord', async () => {
      const app = await getApp();
      const unknown = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'finns.inte@example.com', password: 'något' },
      });
      const wrong = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: ACCOUNTS.orgA.tenant, password: 'felaktigt' },
      });
      expect(unknown.statusCode).toBe(wrong.statusCode);
      expect((unknown.json() as { error: { message: string } }).error.message).toBe(
        (wrong.json() as { error: { message: string } }).error.message,
      );
    });
  });
});
