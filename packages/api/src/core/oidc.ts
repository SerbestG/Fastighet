import type { JsonWebKey } from 'node:crypto';
import { constants, createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'node:crypto';

/**
 * OpenID Connect-klient (krav C.2.4, C.2.5).
 *
 * Authorization code med PKCE. Id-token verifieras mot utfärdarens publika
 * nycklar innan något anspråk används – en signatur som inte går att verifiera
 * gör inloggningen ogiltig, oavsett vad token påstår.
 */

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

export interface OidcClaims {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  email?: string;
  preferred_username?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  [claim: string]: unknown;
}

export class OidcError extends Error {
  constructor(message: string, readonly detail?: Record<string, unknown>) {
    super(message);
    this.name = 'OidcError';
  }
}

const DISCOVERY_TTL_MS = 10 * 60 * 1000;
const JWKS_TTL_MS = 10 * 60 * 1000;

const discoveryCache = new Map<string, { at: number; value: OidcDiscovery }>();
const jwksCache = new Map<string, { at: number; keys: JsonWebKey[] }>();

/** Nollställer mellanlagringen. Används av tester och vid ändrad konfiguration. */
export function resetOidcCaches(): void {
  discoveryCache.clear();
  jwksCache.clear();
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: { accept: 'application/json', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new OidcError('Identitetsleverantören svarade med ett fel.', {
      url,
      status: response.status,
    });
  }
  return response.json();
}

export async function discover(issuerOrUrl: string): Promise<OidcDiscovery> {
  const url = issuerOrUrl.includes('/.well-known/')
    ? issuerOrUrl
    : `${issuerOrUrl.replace(/\/+$/, '')}/.well-known/openid-configuration`;

  const cached = discoveryCache.get(url);
  if (cached && Date.now() - cached.at < DISCOVERY_TTL_MS) return cached.value;

  const document = (await fetchJson(url)) as Partial<OidcDiscovery>;
  if (!document.issuer || !document.authorization_endpoint || !document.token_endpoint || !document.jwks_uri) {
    throw new OidcError('Metadata från identitetsleverantören är ofullständig.', { url });
  }
  const value = document as OidcDiscovery;
  discoveryCache.set(url, { at: Date.now(), value });
  return value;
}

async function jwksFor(jwksUri: string): Promise<JsonWebKey[]> {
  const cached = jwksCache.get(jwksUri);
  if (cached && Date.now() - cached.at < JWKS_TTL_MS) return cached.keys;
  const document = (await fetchJson(jwksUri)) as { keys?: JsonWebKey[] };
  const keys = document.keys ?? [];
  jwksCache.set(jwksUri, { at: Date.now(), keys });
  return keys;
}

/* ------------------------------------------------------------------ PKCE --- */

export function createPkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function randomState(): string {
  return randomBytes(24).toString('base64url');
}

/* ------------------------------------------------------------ id-token --- */

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as Record<string, unknown>;
}

const ALGORITHMS: Record<string, { digest: string }> = {
  RS256: { digest: 'RSA-SHA256' },
  RS384: { digest: 'RSA-SHA384' },
  RS512: { digest: 'RSA-SHA512' },
  ES256: { digest: 'sha256' },
  ES384: { digest: 'sha384' },
  PS256: { digest: 'RSA-SHA256' },
  PS384: { digest: 'RSA-SHA384' },
};

function verifySignature(token: string, jwk: JsonWebKey, alg: string): boolean {
  const [headerPart, payloadPart, signaturePart] = token.split('.');
  if (!headerPart || !payloadPart || !signaturePart) return false;
  const spec = ALGORITHMS[alg];
  if (!spec) return false;

  const key = createPublicKey({ key: jwk as never, format: 'jwk' });
  const data = Buffer.from(`${headerPart}.${payloadPart}`);
  const signature = Buffer.from(signaturePart, 'base64url');

  if (alg.startsWith('ES')) {
    // JWS använder rå r||s, inte DER.
    return verify(spec.digest, data, { key, dsaEncoding: 'ieee-p1363' }, signature);
  }
  if (alg.startsWith('PS')) {
    return verify(
      spec.digest,
      data,
      { key, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: constants.RSA_PSS_SALTLEN_DIGEST },
      signature,
    );
  }
  return verify(spec.digest, data, key, signature);
}

export interface VerifyOptions {
  issuer: string;
  audience: string;
  nonce: string;
  jwksUri: string;
  /** Tillåten avvikelse i sekunder mot leverantörens klocka. */
  clockToleranceSeconds?: number;
}

/**
 * Verifierar ett id-token fullt ut: signatur, utfärdare, mottagare, giltighet
 * och nonce. Först därefter får anspråken användas.
 */
export async function verifyIdToken(token: string, options: VerifyOptions): Promise<OidcClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new OidcError('Id-token har fel format.');

  const header = decodeSegment(parts[0]!) as { alg?: string; kid?: string };
  const alg = header.alg ?? '';
  if (!ALGORITHMS[alg]) {
    throw new OidcError('Id-token är signerat med en algoritm som inte godtas.', { alg });
  }

  const keys = await jwksFor(options.jwksUri);
  const candidates = header.kid
    ? keys.filter((key) => (key as { kid?: string }).kid === header.kid)
    : keys;
  if (!candidates.length) throw new OidcError('Ingen matchande nyckel hos identitetsleverantören.');

  const signatureOk = candidates.some((key) => {
    try {
      return verifySignature(token, key, alg);
    } catch {
      return false;
    }
  });
  if (!signatureOk) throw new OidcError('Signaturen på id-token kunde inte verifieras.');

  const claims = decodeSegment(parts[1]!) as unknown as OidcClaims;
  const tolerance = options.clockToleranceSeconds ?? 60;
  const now = Math.floor(Date.now() / 1000);

  if (claims.iss !== options.issuer) {
    throw new OidcError('Id-token kommer från fel utfärdare.', { iss: claims.iss });
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.audience)) {
    throw new OidcError('Id-token är utfärdat för en annan mottagare.');
  }
  if (typeof claims.exp !== 'number' || claims.exp + tolerance < now) {
    throw new OidcError('Id-token har gått ut.');
  }
  if (typeof claims.iat === 'number' && claims.iat - tolerance > now) {
    throw new OidcError('Id-token är utfärdat i framtiden.');
  }
  if (!claims.nonce || !sameString(claims.nonce, options.nonce)) {
    throw new OidcError('Nonce stämmer inte med inloggningsförsöket.');
  }
  if (!claims.sub) throw new OidcError('Id-token saknar sub.');

  return claims;
}

function sameString(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/* --------------------------------------------------------- kodinlösen --- */

export interface TokenResponse {
  id_token: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

export async function exchangeCode(input: {
  discovery: OidcDiscovery;
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    client_secret: input.clientSecret,
    code_verifier: input.codeVerifier,
  });

  const response = await fetch(input.discovery.token_endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json',
    },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new OidcError('Kodinlösen mot identitetsleverantören misslyckades.', {
      status: response.status,
    });
  }
  const payload = (await response.json()) as Partial<TokenResponse>;
  if (!payload.id_token) throw new OidcError('Svaret saknade id-token.');
  return payload as TokenResponse;
}

/** Bygger adressen användaren skickas till hos identitetsleverantören. */
export function authorizationUrl(input: {
  discovery: OidcDiscovery;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  loginHint?: string;
}): string {
  const url = new URL(input.discovery.authorization_endpoint);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', input.clientId);
  url.searchParams.set('redirect_uri', input.redirectUri);
  url.searchParams.set('scope', 'openid profile email');
  url.searchParams.set('state', input.state);
  url.searchParams.set('nonce', input.nonce);
  url.searchParams.set('code_challenge', input.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  if (input.loginHint) url.searchParams.set('login_hint', input.loginHint);
  return url.toString();
}
