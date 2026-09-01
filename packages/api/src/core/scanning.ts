import { config } from '../config.js';
import { AppError } from './errors.js';

/**
 * Kontroll av uppladdat innehåll (krav C.5.6).
 *
 * Kontrollen sker i två steg. Först en strukturell granskning som alltid körs:
 * filens verkliga inledande byte måste stämma med den angivna typen, och
 * innehåll som ser ut som körbar kod avvisas. Därefter, om en skanningstjänst är
 * konfigurerad, en granskning hos den tjänsten.
 *
 * Utan konfigurerad tjänst släpps filen igenom med den strukturella kontrollen
 * som enda skydd. Det är ett medvetet val – och det redovisas öppet i
 * säkerhetsdokumentationen – eftersom alternativet vore att spärra all
 * uppladdning i en installation som ännu inte har någon skanningstjänst.
 *
 * När en tjänst är konfigurerad men inte svarar spärras filen i stället för att
 * släppas igenom. En otillgänglig skanner får aldrig innebära att kontrollen
 * tyst uteblir.
 */

export type ScanVerdict =
  | { status: 'clean'; detail: string }
  | { status: 'rejected'; detail: string }
  | { status: 'failed'; detail: string };

export interface Scanner {
  readonly name: string;
  scan(buffer: Buffer, filename: string): Promise<ScanVerdict>;
}

/**
 * Skanner som talar med en tjänst över HTTP. Tjänsten förväntas ta emot filen
 * som råa byte och svara med `{ "infected": boolean, "detail"?: string }`.
 * ClamAV nås exempelvis genom clamav-rest eller motsvarande omslag.
 */
class HttpScanner implements Scanner {
  readonly name = 'http';

  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string | undefined,
    private readonly timeoutMs: number,
  ) {}

  async scan(buffer: Buffer, filename: string): Promise<ScanVerdict> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-filename': encodeURIComponent(filename),
          ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
        },
        body: new Uint8Array(buffer),
        signal: controller.signal,
      });

      if (!response.ok) {
        return { status: 'failed', detail: `skannern svarade ${response.status}` };
      }
      const result = (await response.json()) as { infected?: boolean; detail?: string };
      if (result.infected) {
        return { status: 'rejected', detail: result.detail ?? 'skadligt innehåll upptäckt' };
      }
      return { status: 'clean', detail: 'godkänd av skanningstjänsten' };
    } catch (error) {
      const reason = (error as Error).name === 'AbortError' ? 'tidsgränsen överskreds' : 'kunde inte nås';
      return { status: 'failed', detail: `skannern ${reason}` };
    } finally {
      clearTimeout(timer);
    }
  }
}

let cached: Scanner | null | undefined;

/** Den konfigurerade skannern, eller null när ingen är konfigurerad. */
export function getScanner(): Scanner | null {
  if (cached === undefined) {
    cached = config.storage.scanUrl
      ? new HttpScanner(config.storage.scanUrl, config.storage.scanApiKey, config.storage.scanTimeoutMs)
      : null;
  }
  return cached;
}

/** Används av tester för att byta ut skannern. */
export function setScannerForTesting(scanner: Scanner | null | undefined): void {
  cached = scanner;
}

/**
 * Granskar innehållet och returnerar den status filen ska sparas med.
 * Kastar när filen ska avvisas helt.
 */
export async function scanUpload(
  buffer: Buffer,
  filename: string,
): Promise<{ scanStatus: 'clean' | 'pending'; detail: string }> {
  const scanner = getScanner();
  if (!scanner) {
    return {
      scanStatus: 'clean',
      detail: 'strukturell kontroll godkänd, ingen skanningstjänst konfigurerad',
    };
  }

  const verdict = await scanner.scan(buffer, filename);
  if (verdict.status === 'rejected') {
    throw new AppError('unsupported_media_type', 'Filen avvisades vid säkerhetskontrollen.', {
      internal: { scanner: scanner.name, detail: verdict.detail },
    });
  }
  if (verdict.status === 'failed') {
    // Filen sparas i karantän. Den går inte att hämta förrän den granskats om.
    return { scanStatus: 'pending', detail: verdict.detail };
  }
  return { scanStatus: 'clean', detail: verdict.detail };
}
