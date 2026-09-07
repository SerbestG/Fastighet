import { createServer, type Server } from 'node:http';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetOidcCaches } from '../src/core/oidc.js';
import { createAdminPool } from '../src/db/pool.js';
import { ACCOUNTS, getApp } from './helpers.js';

/**
 * Federerad inloggning (krav C.2.4, C.2.5, C.2.6).
 *
 * Testet kör hela flödet mot en riktig OpenID Connect-leverantör som startas
 * lokalt: discovery, JWKS, kodinlösen och ett signerat id-token. Därmed prövas
 * signaturkontrollen på riktigt, inte mot en attrapp som alltid säger ja.
 */

const CLIENT_ID = 'hemvist-test-client';
const CLIENT_SECRET = 'test-hemlighet';

let server: Server;
let issuer: string;
let privateKey: KeyObject;
let publicJwk: Record<string, unknown>;

/** Nästa id-token som tokenendpointen ska lämna ut. */
let nextIdToken: string | null = null;
let lastTokenRequest: Record<string, string> = {};

function base64url(input: object | Buffer): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input));
  return buffer.toString('base64url');
}

function signJwt(payload: Record<string, unknown>, overrides: { alg?: string; kid?: string } = {}): string {
  const header = { alg: overrides.alg ?? 'RS256', typ: 'JWT', kid: overrides.kid ?? 'test-key' };
  const data = `${base64url(header)}.${base64url(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(data);
  const signature = signer.sign(privateKey);
  return `${data}.${base64url(signature)}`;
}

function claimsFor(nonce: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: issuer,
    aud: CLIENT_ID,
    sub: 'entra-sub-0001',
    iat: now,
    exp: now + 300,
    nonce,
    email: 'lisa.forvaltare@demo-botkyrkabyggen.se',
    given_name: 'Lisa',
    family_name: 'Förvaltare',
    groups: ['Hemvist-Forvaltare'],
    ...extra,
  };
}

async function startMockProvider(): Promise<void> {
  const { privateKey: priv, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKey = priv;
  publicJwk = { ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>), kid: 'test-key', alg: 'RS256', use: 'sig' };

  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', issuer);
    if (url.pathname === '/.well-known/openid-configuration') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/authorize`,
          token_endpoint: `${issuer}/token`,
          jwks_uri: `${issuer}/jwks`,
        }),
      );
      return;
    }
    if (url.pathname === '/jwks') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    if (url.pathname === '/token' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => {
        body += chunk;
      });
      request.on('end', () => {
        lastTokenRequest = Object.fromEntries(new URLSearchParams(body).entries());
        if (lastTokenRequest.client_secret !== CLIENT_SECRET) {
          response.writeHead(401, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: 'invalid_client' }));
          return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ id_token: nextIdToken, token_type: 'Bearer', expires_in: 300 }));
      });
      return;
    }
    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('kunde inte starta testleverantören');
  issuer = `http://127.0.0.1:${address.port}`;
}

/** Skriver leverantörskonfigurationen direkt, som driftmiljön skulle ha gjort. */
async function configureProvider(options: { autoProvision: boolean }): Promise<void> {
  const pool = createAdminPool();
  try {
    const org = await pool.query<{ id: string }>(
      'select id from organisations where slug = $1',
      [ACCOUNTS.orgA.slug],
    );
    const orgId = org.rows[0]!.id;
    await pool.query('delete from sso_providers where org_id = $1', [orgId]);
    await pool.query(
      `insert into sso_providers
         (org_id, name, issuer, client_id, client_secret, groups_claim, role_mapping,
          allowed_domains, auto_provision, enabled)
       values ($1,'Microsoft Entra ID',$2,$3,$4,'groups',$5::jsonb,$6,$7,true)`,
      [
        orgId,
        issuer,
        CLIENT_ID,
        CLIENT_SECRET,
        JSON.stringify({ 'Hemvist-Forvaltare': 'property_manager' }),
        ['demo-botkyrkabyggen.se'],
        options.autoProvision,
      ],
    );
  } finally {
    await pool.end();
  }
  resetOidcCaches();
}

async function beginLogin(): Promise<{ state: string; nonce: string }> {
  const app = await getApp();
  const response = await app.inject({
    method: 'GET',
    url: `/api/auth/sso/start?org=${ACCOUNTS.orgA.slug}`,
    headers: { accept: 'application/json' },
  });
  expect(response.statusCode).toBe(200);
  const { authorizationUrl } = response.json() as { authorizationUrl: string };
  const url = new URL(authorizationUrl);
  expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
  return {
    state: url.searchParams.get('state')!,
    nonce: url.searchParams.get('nonce')!,
  };
}

async function completeLogin(state: string) {
  const app = await getApp();
  return app.inject({
    method: 'GET',
    url: `/api/auth/sso/callback?code=test-code&state=${encodeURIComponent(state)}`,
    headers: { accept: 'application/json' },
  });
}

describe('Federerad inloggning med OpenID Connect', () => {
  beforeAll(async () => {
    await startMockProvider();
    await configureProvider({ autoProvision: true });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('startar flödet med PKCE, state och nonce', async () => {
    const { state, nonce } = await beginLogin();
    expect(state.length).toBeGreaterThan(20);
    expect(nonce.length).toBeGreaterThan(20);
  });

  it('loggar in och tilldelar roll utifrån gruppanspråket', async () => {
    const { state, nonce } = await beginLogin();
    nextIdToken = signJwt(claimsFor(nonce));

    const response = await completeLogin(state);
    expect(response.statusCode).toBe(200);
    const body = response.json() as { accessToken: string };
    expect(body.accessToken).toBeDefined();

    // Kodinlösen skedde med PKCE-verifieraren, inte bara med hemligheten.
    expect(lastTokenRequest.code_verifier).toBeDefined();
    expect(lastTokenRequest.grant_type).toBe('authorization_code');

    const me = await (await getApp()).inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${body.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { user: { roles: string[] } }).user.roles).toContain('property_manager');
  });

  it('vägrar id-token med fel signatur', async () => {
    const { state, nonce } = await beginLogin();
    const valid = signJwt(claimsFor(nonce));
    // Byt ut signaturen mot en annan giltig signatur över annan data.
    const forged = `${valid.split('.').slice(0, 2).join('.')}.${signJwt({ x: 1 }).split('.')[2]}`;
    nextIdToken = forged;

    const response = await completeLogin(state);
    expect(response.statusCode).toBe(401);
  });

  it('vägrar id-token med fel nonce', async () => {
    const { state } = await beginLogin();
    nextIdToken = signJwt(claimsFor('helt-annan-nonce'));
    const response = await completeLogin(state);
    expect(response.statusCode).toBe(401);
  });

  it('vägrar id-token från fel utfärdare', async () => {
    const { state, nonce } = await beginLogin();
    nextIdToken = signJwt(claimsFor(nonce, { iss: 'https://angripare.example' }));
    const response = await completeLogin(state);
    expect(response.statusCode).toBe(401);
  });

  it('vägrar id-token som gått ut', async () => {
    const { state, nonce } = await beginLogin();
    const now = Math.floor(Date.now() / 1000);
    nextIdToken = signJwt(claimsFor(nonce, { exp: now - 3600, iat: now - 7200 }));
    const response = await completeLogin(state);
    expect(response.statusCode).toBe(401);
  });

  it('vägrar id-token utan signatur', async () => {
    const { state, nonce } = await beginLogin();
    const parts = signJwt(claimsFor(nonce)).split('.');
    nextIdToken = `${Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')}.${parts[1]}.`;
    const response = await completeLogin(state);
    expect(response.statusCode).toBe(401);
  });

  it('vägrar e-postdomän som inte är tillåten', async () => {
    const { state, nonce } = await beginLogin();
    nextIdToken = signJwt(claimsFor(nonce, { email: 'nagon@annan-domain.example', sub: 'entra-sub-9999' }));
    const response = await completeLogin(state);
    expect(response.statusCode).toBe(401);
  });

  it('samma state kan bara lösas in en gång', async () => {
    const { state, nonce } = await beginLogin();
    nextIdToken = signJwt(claimsFor(nonce));
    const first = await completeLogin(state);
    expect(first.statusCode).toBe(200);

    nextIdToken = signJwt(claimsFor(nonce));
    const second = await completeLogin(state);
    expect(second.statusCode).toBe(401);
  });

  it('okänt konto avvisas när kontot inte får skapas automatiskt', async () => {
    await configureProvider({ autoProvision: false });
    const { state, nonce } = await beginLogin();
    nextIdToken = signJwt(
      claimsFor(nonce, { sub: 'entra-sub-okand', email: 'okand.person@demo-botkyrkabyggen.se' }),
    );
    const response = await completeLogin(state);
    expect(response.statusCode).toBe(401);
    await configureProvider({ autoProvision: true });
  });

  it('konto utan behörighetsgrupp får ingen åtkomst', async () => {
    const { state, nonce } = await beginLogin();
    nextIdToken = signJwt(
      claimsFor(nonce, {
        sub: 'entra-sub-utan-grupp',
        email: 'utan.grupp@demo-botkyrkabyggen.se',
        groups: ['Nagon-Annan-Grupp'],
      }),
    );
    const response = await completeLogin(state);
    expect(response.statusCode).toBe(401);
  });
});
