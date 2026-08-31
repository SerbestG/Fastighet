import type { ScryptOptions } from 'node:crypto';
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCb,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { config } from '../config.js';

// promisify tappar överlagringen med optionsobjekt; typen anges därför explicit.
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const SCRYPT_N = 2 ** 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
// Node ger scrypt en minnesbudget på 32 MB som standard, vilket inte räcker för
// N = 2^15. Budgeten höjs explicit i stället för att sänka kostnadsparametern.
const SCRYPT_MAXMEM = 96 * 1024 * 1024;

/**
 * Lösenord lagras med scrypt och unikt salt. Varken lösenord eller hela tokens
 * skrivs någonsin till loggarna (krav C.3.2).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })) as Buffer;
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  try {
    const salt = Buffer.from(saltB64 as string, 'base64');
    const expected = Buffer.from(hashB64 as string, 'base64');
    const derived = (await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: SCRYPT_MAXMEM,
    })) as Buffer;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** Slumpad token som visas en gång och lagras enbart som hash. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Nyckelbunden hash för värden som måste kunna slås upp men aldrig lagras i
 * klartext, till exempel personnummer vid BankID-inloggning.
 */
export function lookupHash(value: string): string {
  return createHmac('sha256', config.auth.lookupPepper).update(value.trim()).digest('hex');
}

/** Stabil, icke omvändbar nyckel för anonyma enkätsvar. */
export function respondentKey(surveyId: string, userId: string): string {
  return createHmac('sha256', config.auth.lookupPepper)
    .update(`${surveyId}:${userId}`)
    .digest('hex');
}

/** Inbjudningskod som är läsbar i ett brev men fortfarande svår att gissa. */
export function generateInvitationCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 12; i += 1) {
    if (i > 0 && i % 4 === 0) out += '-';
    out += alphabet[randomInt(alphabet.length)];
  }
  return out;
}

/* ------------------------------------------------------------------ JWT --- */

interface JwtPayload {
  sub: string;
  org: string;
  sid: string;
  roles: string[];
  surface: string;
  exp: number;
  iat: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signAccessToken(payload: Omit<JwtPayload, 'exp' | 'iat'>): string {
  const now = Math.floor(Date.now() / 1000);
  const body: JwtPayload = { ...payload, iat: now, exp: now + config.auth.accessTokenTtlSeconds };
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify(body));
  const signature = createHmac('sha256', config.auth.jwtSecret)
    .update(`${header}.${claims}`)
    .digest('base64url');
  return `${header}.${claims}.${signature}`;
}

export function verifyAccessToken(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, claims, signature] = parts as [string, string, string];
  const expected = createHmac('sha256', config.auth.jwtSecret)
    .update(`${header}.${claims}`)
    .digest('base64url');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(claims, 'base64url').toString('utf8')) as JwtPayload;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- TOTP --- */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(): string {
  const buffer = randomBytes(20);
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const clean = secret.replace(/=+$/, '').toUpperCase();
  let bits = '';
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

export function totpCode(secret: string, counter: number): string {
  const key = base32Decode(secret);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', key).update(buffer).digest();
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const binary =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Tillåter ett steg före och efter för att klara klockskillnader. */
export function verifyTotp(secret: string, code: string, window = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  for (let offset = -window; offset <= window; offset += 1) {
    const candidate = totpCode(secret, counter + offset);
    const a = Buffer.from(candidate);
    const b = Buffer.from(code);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return false;
}

export function totpUri(secret: string, account: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}
