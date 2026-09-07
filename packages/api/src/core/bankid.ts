import { createHmac, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { readFileSync } from 'node:fs';
import { config } from '../config.js';

/**
 * BankID-klient (krav C.2.1).
 *
 * Anropen mot BankID sker över ömsesidig TLS med RP-certifikatet. Utan
 * certifikat finns ingen anslutning, och då används en simulator som bara får
 * slås på utanför produktion. Simulatorn redovisas som testmiljö i
 * integrationsregistret – den får aldrig framstå som en verklig anslutning.
 */

export interface BankIdAuthResponse {
  orderRef: string;
  autoStartToken: string;
  qrStartToken: string;
  qrStartSecret: string;
}

export interface BankIdCompletionUser {
  personalNumber: string;
  name: string;
  givenName: string;
  surname: string;
}

export interface BankIdCollectResponse {
  orderRef: string;
  status: 'pending' | 'failed' | 'complete';
  hintCode?: string;
  completionData?: {
    user: BankIdCompletionUser;
    device?: { ipAddress?: string };
    signature?: string;
    ocspResponse?: string;
  };
}

export class BankIdError extends Error {
  constructor(message: string, readonly detail?: Record<string, unknown>) {
    super(message);
    this.name = 'BankIdError';
  }
}

/** Identitet som simulatorn ska intyga. Ignoreras av den riktiga klienten. */
export interface DemoIdentity {
  personalNumber: string;
  name: string;
}

export interface BankIdClient {
  readonly mode: 'live' | 'simulator';
  auth(input: { endUserIp: string; demoIdentity?: DemoIdentity }): Promise<BankIdAuthResponse>;
  collect(orderRef: string): Promise<BankIdCollectResponse>;
  cancel(orderRef: string): Promise<void>;
}

/* ------------------------------------------------------------- QR-kod --- */

/**
 * Den animerade QR-koden enligt BankID:s specifikation. Koden byts varje
 * sekund, vilket hindrar att en avfotograferad kod används någon annanstans.
 */
export function qrCode(qrStartToken: string, qrStartSecret: string, secondsElapsed: number): string {
  const authCode = createHmac('sha256', qrStartSecret)
    .update(String(Math.max(0, Math.floor(secondsElapsed))))
    .digest('hex');
  return `bankid.${qrStartToken}.${Math.max(0, Math.floor(secondsElapsed))}.${authCode}`;
}

/* --------------------------------------------------------- riktig RP --- */

interface TlsMaterial {
  cert: Buffer;
  key: Buffer;
  ca?: Buffer;
  passphrase?: string;
}

function readTlsMaterial(): TlsMaterial | null {
  const { certPath, keyPath, caPath, passphrase } = config.bankid;
  if (!certPath || !keyPath) return null;
  try {
    return {
      cert: readFileSync(certPath),
      key: readFileSync(keyPath),
      ca: caPath ? readFileSync(caPath) : undefined,
      passphrase: passphrase ?? undefined,
    };
  } catch (error) {
    throw new BankIdError('RP-certifikatet gick inte att läsa.', {
      message: (error as Error).message,
    });
  }
}

class LiveBankIdClient implements BankIdClient {
  readonly mode = 'live' as const;

  constructor(private readonly baseUrl: string, private readonly tls: TlsMaterial) {}

  private post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const payload = JSON.stringify(body);
    const url = new URL(path, this.baseUrl);

    return new Promise<T>((resolve, reject) => {
      const req = httpsRequest(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname,
          method: 'POST',
          timeout: 15_000,
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          },
          cert: this.tls.cert,
          key: this.tls.key,
          ca: this.tls.ca,
          passphrase: this.tls.passphrase,
          // Certifikatkontrollen mot BankID:s CA får aldrig stängas av (krav C.5.5).
          rejectUnauthorized: true,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const status = response.statusCode ?? 0;
            if (status >= 400) {
              let code: string | undefined;
              try {
                code = (JSON.parse(text) as { errorCode?: string }).errorCode;
              } catch {
                code = undefined;
              }
              reject(new BankIdError('BankID avvisade anropet.', { status, errorCode: code }));
              return;
            }
            try {
              resolve(text ? (JSON.parse(text) as T) : ({} as T));
            } catch {
              reject(new BankIdError('Svaret från BankID gick inte att tolka.'));
            }
          });
        },
      );
      req.on('timeout', () => {
        req.destroy();
        reject(new BankIdError('BankID svarade inte i tid.'));
      });
      req.on('error', (error) => reject(new BankIdError(error.message)));
      req.write(payload);
      req.end();
    });
  }

  auth(input: { endUserIp: string }): Promise<BankIdAuthResponse> {
    // Identiteten kommer från BankID, aldrig från anroparen.
    return this.post<BankIdAuthResponse>('/rp/v6.0/auth', {
      endUserIp: input.endUserIp,
      requirement: { pinCode: true },
    });
  }

  collect(orderRef: string): Promise<BankIdCollectResponse> {
    return this.post<BankIdCollectResponse>('/rp/v6.0/collect', { orderRef });
  }

  async cancel(orderRef: string): Promise<void> {
    await this.post('/rp/v6.0/cancel', { orderRef });
  }
}

/* -------------------------------------------------------- simulator --- */

interface SimulatedOrder {
  personalNumber: string;
  name: string;
  createdAt: number;
  cancelled: boolean;
  /** Antal collect-anrop innan ordern blir klar, så att flödet syns i gränssnittet. */
  pendingCollects: number;
}

/**
 * Simulator för demonstration och test. Den gör ingen identifiering och får
 * bara användas utanför produktion. Personnumret sätts av den som startar
 * ordern, vilket gör det uppenbart att ingen kontroll skett.
 */
export class SimulatedBankIdClient implements BankIdClient {
  readonly mode = 'simulator' as const;
  private readonly orders = new Map<string, SimulatedOrder>();

  async auth(input: { endUserIp: string; demoIdentity?: DemoIdentity }): Promise<BankIdAuthResponse> {
    const orderRef = randomUUID();
    this.orders.set(orderRef, {
      personalNumber: input.demoIdentity?.personalNumber ?? '',
      name: input.demoIdentity?.name ?? 'Demoperson',
      createdAt: Date.now(),
      cancelled: false,
      pendingCollects: 1,
    });
    return {
      orderRef,
      autoStartToken: randomUUID(),
      qrStartToken: randomUUID(),
      qrStartSecret: randomUUID(),
    };
  }

  async collect(orderRef: string): Promise<BankIdCollectResponse> {
    const order = this.orders.get(orderRef);
    if (!order) return { orderRef, status: 'failed', hintCode: 'noOrder' };
    if (order.cancelled) return { orderRef, status: 'failed', hintCode: 'cancelled' };
    if (order.pendingCollects > 0) {
      order.pendingCollects -= 1;
      return { orderRef, status: 'pending', hintCode: 'userSign' };
    }
    const [givenName, ...rest] = order.name.split(' ');
    return {
      orderRef,
      status: 'complete',
      completionData: {
        user: {
          personalNumber: order.personalNumber,
          name: order.name,
          givenName: givenName ?? order.name,
          surname: rest.join(' '),
        },
      },
    };
  }

  async cancel(orderRef: string): Promise<void> {
    const order = this.orders.get(orderRef);
    if (order) order.cancelled = true;
  }
}

/* ------------------------------------------------------------ fabrik --- */

let cached: BankIdClient | null | undefined;

/**
 * Ger den klient som verkligen går att använda, eller null när BankID varken är
 * anslutet eller simulerat. Anroparen ska då inte erbjuda BankID alls.
 */
export function bankIdClient(): BankIdClient | null {
  if (cached !== undefined) return cached;

  const tls = readTlsMaterial();
  if (tls) {
    cached = new LiveBankIdClient(config.bankid.baseUrl, tls);
    return cached;
  }

  if (config.bankid.simulator && !config.isProduction) {
    cached = new SimulatedBankIdClient();
    return cached;
  }

  cached = null;
  return cached;
}

/** Används av tester som byter konfiguration mellan fall. */
export function resetBankIdClient(): void {
  cached = undefined;
}

/** Vilket läge BankID körs i, för integrationsregistret. */
export function bankIdMode(): 'live' | 'simulator' | 'off' {
  const client = bankIdClient();
  return client ? client.mode : 'off';
}
