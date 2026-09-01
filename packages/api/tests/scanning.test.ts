import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, closeApp, getApp, login, post, type Session } from './helpers.js';
import { setScannerForTesting, type ScanVerdict } from '../src/core/scanning.js';

/** En liten men giltig PNG som klarar den strukturella kontrollen. */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001',
  'hex',
);

async function upload(session: Session, name = 'bild.png') {
  const app = await getApp();
  const boundary = '----hemvisttest';
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
        'Content-Type: image/png\r\n\r\n',
    ),
    PNG,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await app.inject({
    method: 'POST',
    url: '/api/files',
    headers: { ...session.headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
  return { status: response.statusCode, body: response.json() as Record<string, unknown> };
}

describe('Säkerhetsgranskning av bilagor', () => {
  let tenant: Session;

  beforeAll(async () => {
    tenant = await login(ACCOUNTS.orgA.tenant);
  });

  afterEach(() => {
    setScannerForTesting(undefined);
  });

  afterAll(async () => {
    await closeApp();
    setScannerForTesting(undefined);
  });

  it('släpper igenom filen när ingen skanningstjänst är konfigurerad', async () => {
    setScannerForTesting(null);
    const result = await upload(tenant);
    expect(result.status).toBe(200);
    const files = result.body.files as { scanStatus: string }[];
    expect(files[0]!.scanStatus).toBe('clean');
    expect(result.body.quarantined).toBe(0);
  });

  it('avvisar en fil som skannern flaggar som skadlig', async () => {
    setScannerForTesting({
      name: 'test',
      scan: async (): Promise<ScanVerdict> => ({ status: 'rejected', detail: 'Eicar-Test-Signature' }),
    });
    const result = await upload(tenant, 'skadlig.png');
    expect(result.status).toBe(415);
    const error = result.body.error as { message: string };
    expect(error.message).toMatch(/avvisades vid säkerhetskontrollen/i);
  });

  it('sätter filen i karantän när skannern inte kan nås', async () => {
    setScannerForTesting({
      name: 'test',
      scan: async (): Promise<ScanVerdict> => ({ status: 'failed', detail: 'skannern kunde inte nås' }),
    });
    const result = await upload(tenant, 'ogranskad.png');
    expect(result.status).toBe(200);
    const files = result.body.files as { id: string; scanStatus: string }[];
    expect(files[0]!.scanStatus).toBe('pending');
    expect(result.body.quarantined).toBe(1);
    expect(result.body.message).toBeTruthy();

    // En fil i karantän går varken att koppla till ett ärende eller att hämta.
    const attached = await post<{ error: { message: string } }>(tenant, '/api/cases', {
      locationKind: 'residence',
      categoryKey: 'kitchen',
      subcategoryKey: 'cabinets',
      description: 'Luckan i köksskåpet sitter löst.',
      attachmentIds: [files[0]!.id],
    });
    expect(attached.status).toBe(400);
    expect(attached.body.error.message).toMatch(/säkerhetsgranskning/i);

    const app = await getApp();
    const download = await app.inject({
      method: 'GET',
      url: `/api/files/${files[0]!.id}`,
      headers: tenant.headers,
    });
    expect(download.statusCode).toBe(403);
  });

  it('en otillgänglig skanner får aldrig leda till att kontrollen tyst uteblir', async () => {
    let called = false;
    setScannerForTesting({
      name: 'test',
      scan: async (): Promise<ScanVerdict> => {
        called = true;
        return { status: 'failed', detail: 'tidsgränsen överskreds' };
      },
    });
    const result = await upload(tenant, 'timeout.png');
    expect(called).toBe(true);
    const files = result.body.files as { scanStatus: string }[];
    expect(files[0]!.scanStatus).not.toBe('clean');
  });
});
