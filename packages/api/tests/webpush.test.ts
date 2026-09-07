import {
  createDecipheriv,
  createECDH,
  createHmac,
  createPublicKey,
  createVerify,
  randomBytes,
} from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptPayload, generateVapidKeys } from '../src/core/webpush.js';

/**
 * Webbpush (krav B.1.5).
 *
 * Testet spelar mottagarens roll: det skapar ett riktigt nyckelpar, låter
 * servern kryptera, och dekrypterar sedan enligt RFC 8291 med bara det en
 * webbläsare har tillgång till. Går det inte att dekryptera hade notisen inte
 * kunnat visas på en riktig enhet heller.
 */

function hkdf(salt: Buffer, ikm: Buffer, info: Buffer, length: number): Buffer {
  const prk = createHmac('sha256', salt).update(ikm).digest();
  return createHmac('sha256', prk)
    .update(Buffer.concat([info, Buffer.from([0x01])]))
    .digest()
    .subarray(0, length);
}

/** En prenumeration som en webbläsare skulle ha skapat. */
function subscriber() {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    ecdh,
    subscription: {
      endpoint: 'https://push.example/abc123',
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: auth.toString('base64url'),
    },
    auth,
  };
}

/** Dekryptering på samma sätt som webbläsaren gör den. */
function decrypt(body: Buffer, ecdh: ReturnType<typeof createECDH>, auth: Buffer): string {
  const salt = body.subarray(0, 16);
  const keyLength = body.readUInt8(20);
  const serverPublic = body.subarray(21, 21 + keyLength);
  const ciphertext = body.subarray(21 + keyLength);

  const sharedSecret = ecdh.computeSecret(serverPublic);
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0', 'utf8'),
    ecdh.getPublicKey(),
    serverPublic,
  ]);
  const ikm = hkdf(auth, sharedSecret, keyInfo, 32);
  const key = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0', 'utf8'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0', 'utf8'), 12);

  const tag = ciphertext.subarray(ciphertext.length - 16);
  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext.subarray(0, ciphertext.length - 16)),
    decipher.final(),
  ]);
  // Sista byten är avgränsaren.
  return plaintext.subarray(0, plaintext.length - 1).toString('utf8');
}

describe('Webbpush', () => {
  it('krypterar så att mottagaren kan läsa notisen', () => {
    const { ecdh, subscription, auth } = subscriber();
    const payload = JSON.stringify({
      title: 'Ditt ärende har uppdaterats',
      body: 'Besök bokat.',
      route: '/arenden',
      id: 'abc',
    });

    const body = encryptPayload(subscription, payload);
    expect(decrypt(body, ecdh, auth)).toBe(payload);
  });

  it('kroppen följer aes128gcm-formatet', () => {
    const { subscription } = subscriber();
    const body = encryptPayload(subscription, 'hej');
    expect(body.readUInt32BE(16)).toBe(4096);
    expect(body.readUInt8(20)).toBe(65);
    expect(body.subarray(21, 22)[0]).toBe(0x04);
  });

  it('varje utskick använder nytt salt och ny efemär nyckel', () => {
    const { subscription } = subscriber();
    const first = encryptPayload(subscription, 'samma text');
    const second = encryptPayload(subscription, 'samma text');
    expect(first.subarray(0, 16).equals(second.subarray(0, 16))).toBe(false);
    expect(first.subarray(21, 86).equals(second.subarray(21, 86))).toBe(false);
  });

  it('en annan mottagare kan inte läsa notisen', () => {
    const intended = subscriber();
    const other = subscriber();
    const body = encryptPayload(intended.subscription, 'hemligt');
    expect(() => decrypt(body, other.ecdh, other.auth)).toThrow();
  });

  it('avvisar prenumeration med felaktig nyckel', () => {
    expect(() =>
      encryptPayload(
        { endpoint: 'https://push.example/x', p256dh: 'AAAA', auth: randomBytes(16).toString('base64url') },
        'hej',
      ),
    ).toThrow(/nyckel/i);
  });

  it('VAPID-nyckelparet går att verifiera med', () => {
    const keys = generateVapidKeys();
    const publicKey = Buffer.from(keys.publicKey, 'base64url');
    expect(publicKey.length).toBe(65);
    expect(publicKey[0]).toBe(0x04);

    // Nyckeln ska gå att bygga upp som en riktig publik nyckel.
    const key = createPublicKey({
      key: {
        kty: 'EC',
        crv: 'P-256',
        x: publicKey.subarray(1, 33).toString('base64url'),
        y: publicKey.subarray(33, 65).toString('base64url'),
      },
      format: 'jwk',
    });
    expect(key.asymmetricKeyType).toBe('ec');

    // Två anrop ger olika nycklar.
    expect(generateVapidKeys().publicKey).not.toBe(keys.publicKey);
  });

  it('samma nyckelpar signerar och verifierar ett VAPID-token', async () => {
    const keys = generateVapidKeys();
    const publicKey = Buffer.from(keys.publicKey, 'base64url');
    const { createSign } = await import('node:crypto');
    const data = Buffer.from('test.data');

    const signature = createSign('SHA256')
      .update(data)
      .sign({
        key: {
          kty: 'EC',
          crv: 'P-256',
          d: keys.privateKey,
          x: publicKey.subarray(1, 33).toString('base64url'),
          y: publicKey.subarray(33, 65).toString('base64url'),
        } as never,
        format: 'jwk',
        dsaEncoding: 'ieee-p1363',
      });

    const ok = createVerify('SHA256')
      .update(data)
      .verify(
        {
          key: {
            kty: 'EC',
            crv: 'P-256',
            x: publicKey.subarray(1, 33).toString('base64url'),
            y: publicKey.subarray(33, 65).toString('base64url'),
          } as never,
          format: 'jwk',
          dsaEncoding: 'ieee-p1363',
        },
        signature,
      );
    expect(ok).toBe(true);
  });
});
