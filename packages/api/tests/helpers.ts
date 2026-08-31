import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { totpCode } from '../src/core/crypto.js';
import { DEMO_PASSWORD } from '../src/db/seed.js';
import { createAdminPool } from '../src/db/pool.js';

export { DEMO_PASSWORD };

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  userId: string;
  headers: { authorization: string };
}

/** Hämtar en personalanvändares TOTP-hemlighet direkt ur databasen. */
async function mfaSecret(email: string): Promise<string | null> {
  const pool = createAdminPool();
  try {
    const result = await pool.query<{ mfa_secret: string | null }>(
      'select mfa_secret from users where lower(email) = lower($1)',
      [email],
    );
    return result.rows[0]?.mfa_secret ?? null;
  } finally {
    await pool.end();
  }
}

export async function login(email: string, password = DEMO_PASSWORD): Promise<Session> {
  const server = await getApp();
  let response = await server.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
  });

  const body = response.json() as { error?: { code: string }; accessToken?: string; refreshToken?: string; user?: { id: string } };
  if (body.error?.code === 'mfa_required') {
    const secret = await mfaSecret(email);
    if (!secret) throw new Error(`Kontot ${email} kräver engångskod men saknar hemlighet.`);
    response = await server.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password, totp: totpCode(secret, Math.floor(Date.now() / 1000 / 30)) },
    });
  }

  if (response.statusCode !== 200) {
    throw new Error(`Inloggning misslyckades för ${email}: ${response.statusCode} ${response.body}`);
  }
  const session = response.json() as { accessToken: string; refreshToken: string; user: { id: string } };
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    userId: session.user.id,
    headers: { authorization: `Bearer ${session.accessToken}` },
  };
}

export async function get<T = unknown>(session: Session, url: string): Promise<{ status: number; body: T }> {
  const server = await getApp();
  const response = await server.inject({ method: 'GET', url, headers: session.headers });
  return { status: response.statusCode, body: response.json() as T };
}

export async function post<T = unknown>(
  session: Session,
  url: string,
  payload?: unknown,
): Promise<{ status: number; body: T }> {
  const server = await getApp();
  const response = await server.inject({ method: 'POST', url, headers: session.headers, payload: payload ?? {} });
  return { status: response.statusCode, body: response.json() as T };
}

export async function patch<T = unknown>(
  session: Session,
  url: string,
  payload: unknown,
): Promise<{ status: number; body: T }> {
  const server = await getApp();
  const response = await server.inject({ method: 'PATCH', url, headers: session.headers, payload });
  return { status: response.statusCode, body: response.json() as T };
}

export async function del<T = unknown>(session: Session, url: string): Promise<{ status: number; body: T }> {
  const server = await getApp();
  const response = await server.inject({ method: 'DELETE', url, headers: session.headers });
  return { status: response.statusCode, body: response.json() as T };
}

/** Konton i demodata, ett per roll och organisation. */
export const ACCOUNTS = {
  orgA: {
    slug: 'botkyrkabyggen',
    tenant: 'robin.ek@example.com',
    coResident: 'maja.ek@example.com',
    otherTenant: 'fatima.haddad@example.com',
    admin: 'anna.lindqvist@demo-botkyrkabyggen.se',
    manager: 'peter.ohlsson@demo-botkyrkabyggen.se',
    customerService: 'sara.nyman@demo-botkyrkabyggen.se',
    caretaker: 'kemal.yildiz@demo-botkyrkabyggen.se',
    contractor: 'tobias.strom@demo-stromochror.se',
  },
  orgB: {
    slug: 'norrstaden',
    tenant: 'karin.holm@example.com',
    admin: 'marcus.sund@demo-norrstaden.se',
    manager: 'lena.oberg@demo-norrstaden.se',
    contractor: 'ingrid.norell@demo-norrlandsservice.se',
  },
} as const;
