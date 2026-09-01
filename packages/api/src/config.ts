import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

/**
 * Konfiguration läses från miljövariabler. Inga hemligheter har inbyggda
 * standardvärden i produktionsläge – servern vägrar starta i stället för att
 * använda en gissad nyckel.
 */

const env = process.env;
const nodeEnv = env.NODE_ENV ?? 'development';
export const isProduction = nodeEnv === 'production';
export const isTest = nodeEnv === 'test';

function required(name: string): string {
  const value = env[name];
  if (!value) {
    if (isProduction) {
      throw new Error(`Miljövariabeln ${name} måste vara satt i produktion.`);
    }
    return '';
  }
  return value;
}

function secret(name: string, devFallback: string): string {
  const value = env[name];
  if (value && value.length >= 32) return value;
  if (isProduction) {
    throw new Error(`Miljövariabeln ${name} måste vara satt och minst 32 tecken i produktion.`);
  }
  return value || devFallback;
}

function num(name: string, fallback: number): number {
  const raw = env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = env[name];
  if (raw === undefined) return fallback;
  return raw === 'true' || raw === '1';
}

const dbHost = env.PGHOST ?? 'localhost';
const dbPort = num('PGPORT', 5432);
const dbName = env.PGDATABASE ?? (isTest ? 'hemvist_test' : 'hemvist');

export const config = {
  nodeEnv,
  isProduction,
  isTest,
  port: num('PORT', 4000),
  host: env.HOST ?? '0.0.0.0',
  publicApiUrl: env.PUBLIC_API_URL ?? `http://localhost:${num('PORT', 4000)}`,
  webOrigins: (env.WEB_ORIGINS ?? 'http://localhost:5173').split(',').map((o) => o.trim()),

  db: {
    /** Anslutning med ägarrättigheter – används enbart av migreringar och seed. */
    adminUrl:
      env.DATABASE_ADMIN_URL ??
      `postgresql://${env.PGADMINUSER ?? 'postgres'}:${env.PGADMINPASSWORD ?? 'postgres'}@${dbHost}:${dbPort}/${dbName}`,
    /**
     * Anslutning för applikationen. Rollen saknar SUPERUSER och BYPASSRLS, vilket
     * är det som gör kundsepareringen verksam.
     */
    appUrl:
      env.DATABASE_URL ??
      `postgresql://${env.APP_DB_USER ?? 'hemvist_app'}:${env.APP_DB_PASSWORD ?? 'hemvist_app'}@${dbHost}:${dbPort}/${dbName}`,
    appUser: env.APP_DB_USER ?? 'hemvist_app',
    appPassword: env.APP_DB_PASSWORD ?? 'hemvist_app',
    name: dbName,
    poolMax: num('DB_POOL_MAX', 10),
    statementTimeoutMs: num('DB_STATEMENT_TIMEOUT_MS', 15_000),
  },

  auth: {
    /** Signeringsnyckel för åtkomsttoken. */
    jwtSecret: secret('JWT_SECRET', 'utvecklingsnyckel-endast-for-lokal-korning-1'),
    /** Separat nyckel för hashning av uppslagsbara värden (t.ex. personnummer). */
    lookupPepper: secret('LOOKUP_PEPPER', 'utvecklingspeppar-endast-for-lokal-korning-2'),
    accessTokenTtlSeconds: num('ACCESS_TOKEN_TTL', 15 * 60),
    /** Absolut livslängd för en session. */
    refreshTokenTtlSeconds: num('REFRESH_TOKEN_TTL', 30 * 24 * 3600),
    /** Sessionen avslutas efter inaktivitet – kortare för personal (krav C.2.10). */
    staffIdleTimeoutSeconds: num('STAFF_IDLE_TIMEOUT', 30 * 60),
    residentIdleTimeoutSeconds: num('RESIDENT_IDLE_TIMEOUT', 14 * 24 * 3600),
    maxFailedLogins: num('MAX_FAILED_LOGINS', 8),
    lockoutMinutes: num('LOCKOUT_MINUTES', 15),
    /** Kräv verifierad e-postadress innan inloggning tillåts. */
    requireVerifiedEmail: bool('REQUIRE_VERIFIED_EMAIL', true),
  },

  storage: {
    driver: env.STORAGE_DRIVER ?? 'local',
    localRoot: resolve(env.STORAGE_ROOT ?? './var/storage'),
    maxFileBytes: num('MAX_FILE_BYTES', 25 * 1024 * 1024),
    maxFilesPerRequest: num('MAX_FILES_PER_REQUEST', 10),
    allowedMimeTypes: (
      env.ALLOWED_MIME_TYPES ??
      'image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,application/pdf'
    )
      .split(',')
      .map((m) => m.trim()),
    /**
     * Adress till skanningstjänst för uppladdat innehåll. Utan adress sker
     * enbart den strukturella kontrollen (se src/core/scanning.ts).
     */
    scanUrl: env.FILE_SCAN_URL,
    scanApiKey: env.FILE_SCAN_API_KEY,
    scanTimeoutMs: num('FILE_SCAN_TIMEOUT_MS', 10_000),
  },

  jobs: {
    enabled: bool('JOBS_ENABLED', !isTest),
    intervalMs: num('JOBS_INTERVAL_MS', 60_000),
  },

  rateLimit: {
    max: num('RATE_LIMIT_MAX', 300),
    windowMs: num('RATE_LIMIT_WINDOW_MS', 60_000),
    authMax: num('AUTH_RATE_LIMIT_MAX', 10),
  },

  logging: {
    level: env.LOG_LEVEL ?? (isTest ? 'silent' : 'info'),
  },
} as const;

/** Slumpad identitet för instansen, syns i spårnings-ID:n. */
export const instanceId = randomBytes(4).toString('hex');
