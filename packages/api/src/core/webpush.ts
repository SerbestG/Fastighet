import {
  createECDH,
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSign,
  generateKeyPairSync,
  randomBytes,
  createCipheriv,
} from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';
import { config } from '../config.js';

/**
 * Web Push (krav B.1.5).
 *
 * Notisen krypteras enligt RFC 8291 med aes128gcm och signeras med VAPID enligt
 * RFC 8292. Push-tjänsten kan därför varken läsa innehållet eller skicka något i
 * plattformens namn. Nycklarna ägs av tjänsten själv – ingen extern leverantör
 * behövs för att pushnotiser till webbappen ska fungera.
 */

export class WebPushError extends Error {
  constructor(message: string, readonly statusCode?: number, readonly permanent = false) {
    super(message);
    this.name = 'WebPushError';
  }
}

export interface PushSubscription {
  endpoint: string;
  /** Klientens publika nyckel, base64url utan padding. */
  p256dh: string;
  /** Klientens autentiseringshemlighet, base64url. */
  auth: string;
}

/* --------------------------------------------------------------- VAPID --- */

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
}

/** Skapar ett VAPID-nyckelpar. Körs en gång och sparas i driftmiljön. */
export function generateVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pubJwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const privJwk = privateKey.export({ format: 'jwk' }) as { d: string };
  const uncompressed = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(pubJwk.x, 'base64url'),
    Buffer.from(pubJwk.y, 'base64url'),
  ]);
  return {
    publicKey: uncompressed.toString('base64url'),
    privateKey: privJwk.d,
  };
}

function vapidPrivateKeyObject(privateKeyBase64Url: string, publicKeyBase64Url: string) {
  const publicKey = Buffer.from(publicKeyBase64Url, 'base64url');
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new WebPushError('VAPID-nyckeln har fel format.');
  }
  return createPrivateKey({
    key: {
      kty: 'EC',
      crv: 'P-256',
      d: privateKeyBase64Url,
      x: publicKey.subarray(1, 33).toString('base64url'),
      y: publicKey.subarray(33, 65).toString('base64url'),
    },
    format: 'jwk',
  });
}

/** Signerar VAPID-JWT för en push-tjänst. `aud` är tjänstens ursprung. */
function vapidHeaders(endpoint: string, keys: VapidKeys, subject: string): Record<string, string> {
  const audience = new URL(endpoint).origin;
  const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      aud: audience,
      // Giltigt i tolv timmar, vilket är väl inom det tillåtna dygnet.
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: subject,
    }),
  ).toString('base64url');

  const signer = createSign('SHA256');
  signer.update(`${header}.${payload}`);
  // JWS vill ha rå r||s, inte DER.
  const signature = signer.sign({
    key: vapidPrivateKeyObject(keys.privateKey, keys.publicKey),
    dsaEncoding: 'ieee-p1363',
  });

  return {
    authorization: `vapid t=${header}.${payload}.${signature.toString('base64url')}, k=${keys.publicKey}`,
  };
}

/* ---------------------------------------------------------- kryptering --- */

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  const output = createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest();
  return output.subarray(0, length);
}

/**
 * Krypterar nyttolasten enligt RFC 8291. Resultatet är hela kroppen inklusive
 * huvudet med salt, postlängd och den efemära publika nyckeln.
 */
export function encryptPayload(subscription: PushSubscription, payload: string): Buffer {
  const clientPublic = Buffer.from(subscription.p256dh, 'base64url');
  const clientAuth = Buffer.from(subscription.auth, 'base64url');
  if (clientPublic.length !== 65 || clientPublic[0] !== 0x04) {
    throw new WebPushError('Prenumerationens nyckel har fel format.', undefined, true);
  }
  if (clientAuth.length < 16) {
    throw new WebPushError('Prenumerationens hemlighet har fel längd.', undefined, true);
  }

  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const serverPublic = ecdh.getPublicKey();
  const sharedSecret = ecdh.computeSecret(clientPublic);

  // Nyckelmaterialet binds till båda parternas publika nycklar.
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    clientPublic,
    serverPublic,
  ]);
  const ikm = hkdf(clientAuth, sharedSecret, keyInfo, 32);

  const salt = randomBytes(16);
  const contentEncryptionKey = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  // 0x02 avslutar den sista posten; ingen ytterligare utfyllnad används.
  const plaintext = Buffer.concat([Buffer.from(payload, 'utf8'), Buffer.from([0x02])]);
  const cipher = createCipheriv('aes-128-gcm', contentEncryptionKey, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096, 0);

  return Buffer.concat([
    salt,
    recordSize,
    Buffer.from([serverPublic.length]),
    serverPublic,
    ciphertext,
  ]);
}

/* ------------------------------------------------------------- utskick --- */

interface SendResult {
  statusCode: number;
}

function post(url: URL, body: Buffer, headers: Record<string, string>): Promise<SendResult> {
  const send = url.protocol === 'http:' ? httpRequest : httpsRequest;
  return new Promise<SendResult>((resolve, reject) => {
    const req = send(
      {
        hostname: url.hostname,
        port: url.port || (url.protocol === 'http:' ? 80 : 443),
        path: `${url.pathname}${url.search}`,
        method: 'POST',
        timeout: 15_000,
        headers: { ...headers, 'content-length': body.length },
      },
      (response) => {
        response.resume();
        response.on('end', () => resolve({ statusCode: response.statusCode ?? 0 }));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new WebPushError('Push-tjänsten svarade inte i tid.'));
    });
    req.on('error', (error) => reject(new WebPushError(error.message)));
    req.write(body);
    req.end();
  });
}

/**
 * Skickar en notis. Kastar WebPushError med `permanent` satt när prenumerationen
 * är borta, så att anroparen kan ta bort den i stället för att försöka igen.
 */
export async function sendPush(subscription: PushSubscription, payload: string): Promise<void> {
  const keys = vapidKeys();
  if (!keys) throw new WebPushError('VAPID-nycklar saknas.', undefined, true);

  const body = encryptPayload(subscription, payload);
  const url = new URL(subscription.endpoint);
  const headers = {
    ...vapidHeaders(subscription.endpoint, keys, config.push.subject),
    'content-type': 'application/octet-stream',
    'content-encoding': 'aes128gcm',
    ttl: String(config.push.ttlSeconds),
    urgency: 'normal',
  };

  const result = await post(url, body, headers);
  if (result.statusCode === 404 || result.statusCode === 410) {
    throw new WebPushError('Prenumerationen finns inte längre.', result.statusCode, true);
  }
  if (result.statusCode >= 400) {
    throw new WebPushError('Push-tjänsten avvisade utskicket.', result.statusCode);
  }
}

/** Nycklarna från driftmiljön, eller null när push inte är konfigurerat. */
export function vapidKeys(): VapidKeys | null {
  const { vapidPublicKey, vapidPrivateKey } = config.push;
  if (!vapidPublicKey || !vapidPrivateKey) return null;
  return { publicKey: vapidPublicKey, privateKey: vapidPrivateKey };
}
