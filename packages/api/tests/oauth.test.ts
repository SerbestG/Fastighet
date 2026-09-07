import { beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, type Session, get, getApp, login, patch, post } from './helpers.js';

/**
 * OAuth 2.0 för integrationer (krav A.1.15, C.2.12, C.3.2, C.3.3).
 *
 * Testerna kontrollerar att ett integrationstoken ger exakt de behörigheter som
 * dess scope medger, att det går att återkalla, och att kundsepareringen gäller
 * även för maskinkonton.
 */

interface CreatedClient {
  id: string;
  clientId: string;
  clientSecret: string;
}

async function form(url: string, body: Record<string, string>, headers: Record<string, string> = {}) {
  const server = await getApp();
  const response = await server.inject({
    method: 'POST',
    url,
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    payload: new URLSearchParams(body).toString(),
  });
  return { status: response.statusCode, body: response.json() as Record<string, unknown> };
}

async function bearerGet(token: string, url: string) {
  const server = await getApp();
  const response = await server.inject({
    method: 'GET',
    url,
    headers: { authorization: `Bearer ${token}` },
  });
  return { status: response.statusCode, body: response.json() as Record<string, unknown> };
}

describe('OAuth 2.0 för integrationer', () => {
  let adminA: Session;
  let adminB: Session;
  let clientA: CreatedClient;

  beforeAll(async () => {
    adminA = await login(ACCOUNTS.orgA.admin);
    adminB = await login(ACCOUNTS.orgB.admin);
    const created = await post<CreatedClient>(adminA, '/api/staff/integrations/clients', {
      name: 'Vitec fastighetssystem',
      description: 'Läser ärenden och skriver fastighetsstruktur.',
      scopes: ['cases:read', 'properties:read'],
    });
    expect(created.status).toBe(201);
    clientA = created.body;
  });

  it('hemligheten visas en gång och lagras aldrig i klartext', async () => {
    expect(clientA.clientSecret).toMatch(/^[\w-]{40,}$/);
    const list = await get<{ clients: { client_id: string; secret_hint: string }[] }>(
      adminA,
      '/api/staff/integrations/clients',
    );
    const row = list.body.clients.find((c) => c.client_id === clientA.clientId);
    expect(row).toBeDefined();
    expect(JSON.stringify(row)).not.toContain(clientA.clientSecret);
    expect(row!.secret_hint).toBe(clientA.clientSecret.slice(-4));
  });

  it('utfärdar token med client_credentials', async () => {
    const result = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
    });
    expect(result.status).toBe(200);
    expect(result.body.token_type).toBe('Bearer');
    expect(result.body.scope).toBe('cases:read properties:read');
    expect(typeof result.body.access_token).toBe('string');
  });

  it('godtar klientuppgifter i Basic-huvudet', async () => {
    const basic = Buffer.from(`${clientA.clientId}:${clientA.clientSecret}`).toString('base64');
    const result = await form(
      '/api/oauth/token',
      { grant_type: 'client_credentials' },
      { authorization: `Basic ${basic}` },
    );
    expect(result.status).toBe(200);
    expect(result.body.access_token).toBeDefined();
  });

  it('avvisar fel hemlighet utan att avslöja om klienten finns', async () => {
    const wrongSecret = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: 'fel-hemlighet',
    });
    const wrongClient = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: 'hv_finns_inte',
      client_secret: 'fel-hemlighet',
    });
    expect(wrongSecret.status).toBe(401);
    expect(wrongClient.status).toBe(401);
    expect(wrongSecret.body).toEqual(wrongClient.body);
  });

  it('avvisar andra grant-typer', async () => {
    const result = await form('/api/oauth/token', {
      grant_type: 'password',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('unsupported_grant_type');
  });

  it('vägrar scope som klienten inte har tilldelats', async () => {
    const result = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
      scope: 'cases:write',
    });
    expect(result.status).toBe(400);
    expect(result.body.error).toBe('invalid_scope');
  });

  it('ger åtkomst till det scope medger och inget annat', async () => {
    const issued = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
    });
    const token = issued.body.access_token as string;

    const cases = await bearerGet(token, '/api/staff/cases');
    expect(cases.status).toBe(200);

    // Klienten har inte scope för hyresgästuppgifter eller säkerhetsloggen.
    const residents = await bearerGet(token, '/api/staff/residents');
    expect(residents.status).toBe(403);
    const auditLog = await bearerGet(token, '/api/staff/audit-log');
    expect(auditLog.status).toBe(403);
  });

  it('ett token från ett bolag når aldrig det andra bolagets data', async () => {
    const issued = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
    });
    const token = issued.body.access_token as string;

    const own = await bearerGet(token, '/api/staff/cases');
    const otherCases = await get<{ cases: { id: string }[] }>(adminB, '/api/staff/cases');
    const otherId = otherCases.body.cases[0]?.id;
    expect(otherId).toBeDefined();

    const stolen = await bearerGet(token, `/api/staff/cases/${otherId}`);
    expect(stolen.status).toBe(404);
    expect(JSON.stringify(own.body)).not.toContain(otherId!);
  });

  it('introspektion redovisar aktivt token och känner igen återkallat', async () => {
    const issued = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
    });
    const token = issued.body.access_token as string;

    const active = await form('/api/oauth/introspect', {
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
      token,
    });
    expect(active.body.active).toBe(true);
    expect(active.body.client_id).toBe(clientA.clientId);

    const revoked = await form('/api/oauth/revoke', {
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
      token,
    });
    expect(revoked.status).toBe(200);

    const after = await form('/api/oauth/introspect', {
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
      token,
    });
    expect(after.body.active).toBe(false);
    const blocked = await bearerGet(token, '/api/staff/cases');
    expect(blocked.status).toBe(401);
  });

  it('byte av hemlighet ogiltigförklarar tidigare token', async () => {
    const issued = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
    });
    const token = issued.body.access_token as string;
    expect((await bearerGet(token, '/api/staff/cases')).status).toBe(200);

    const rotated = await post<{ clientSecret: string }>(
      adminA,
      `/api/staff/integrations/clients/${clientA.id}/rotate`,
      {},
    );
    expect(rotated.status).toBe(200);
    expect(rotated.body.clientSecret).not.toBe(clientA.clientSecret);

    expect((await bearerGet(token, '/api/staff/cases')).status).toBe(401);
    const oldSecret = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
    });
    expect(oldSecret.status).toBe(401);
    clientA = { ...clientA, clientSecret: rotated.body.clientSecret };
  });

  it('avstängd klient får varken använda eller hämta token', async () => {
    const issued = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
    });
    const token = issued.body.access_token as string;

    const disabled = await patch(adminA, `/api/staff/integrations/clients/${clientA.id}`, {
      status: 'disabled',
    });
    expect(disabled.status).toBe(200);

    expect((await bearerGet(token, '/api/staff/cases')).status).toBe(401);
    const retry = await form('/api/oauth/token', {
      grant_type: 'client_credentials',
      client_id: clientA.clientId,
      client_secret: clientA.clientSecret,
    });
    expect(retry.status).toBe(401);
  });

  it('integrationskontot kan inte logga in som en människa', async () => {
    const server = await getApp();
    const response = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: `${clientA.clientId}@integration.local`, password: 'vad-som-helst' },
    });
    expect(response.statusCode).toBeGreaterThanOrEqual(400);
  });
});
