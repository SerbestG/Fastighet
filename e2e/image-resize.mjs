/**
 * Kontroll av att bilder skalas ned innan uppladdning (krav B.1.32).
 *
 * Skapar en stor bild, går igenom felanmälan och jämför originalets storlek med
 * den fil som faktiskt lagras. Körs mot en igångvarande miljö, se e2e/README.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

/** Skapar en stor PNG med brus, så att den inte komprimeras bort. */
function makeLargePng(path, width, height) {
  const rows = Buffer.alloc(height * (1 + width * 3));
  let offset = 0;
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16) & 0xff;
  for (let y = 0; y < height; y += 1) {
    rows[offset] = 0;
    offset += 1;
    const base = Math.floor((y * 255) / height);
    for (let x = 0; x < width; x += 1) {
      rows[offset] = (base + x) % 256;
      rows[offset + 1] = (x * 7 + y * 3) % 256;
      rows[offset + 2] = random();
      offset += 3;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  return png.length;
}

mkdirSync('e2e/screenshots', { recursive: true });
const IMAGE_PATH = 'e2e/screenshots/stor-testbild.png';
const originalBytes = makeLargePng(IMAGE_PATH, 3600, 2400);
import { chromium } from 'playwright';
const B = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'sv-SE' })).newPage();
page.on('pageerror', (e) => console.log('SIDFEL:', e.message));

await page.goto(B, { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'robin.ek@example.com');
await page.fill('input[type=password]', 'Demolosenord123!');
await page.click('button[type=submit]');
await page.waitForSelector('text=Hej Robin', { timeout: 15000 });

// Multipart skickas styckvis, så content-length saknas. Storleken läses i
// stället ur svaret från servern – det är den fil som faktiskt lagras.
let uploadedBytes = 0;
page.on('response', async (r) => {
  if (r.url().endsWith('/api/files') && r.request().method() === 'POST' && r.ok()) {
    try {
      const body = await r.json();
      uploadedBytes = body.files?.[0]?.sizeBytes ?? 0;
    } catch {
      /* ignoreras */
    }
  }
});

await page.goto(B + '/arenden/nytt', { waitUntil: 'networkidle' });
await page.click('text=I bostaden');
await page.click('button:has-text("Nästa")');
await page.click('.choice-card:has-text("Vitvaror")');
await page.click('.choice-card:has-text("Kyl eller frys")');
await page.click('button:has-text("Nästa")');
await page.click('fieldset:has-text("Håller den inte kylan?") .chip:has-text("Ja")');
await page.click('fieldset:has-text("Läcker det vatten?") .chip:has-text("Nej")');
await page.fill('textarea', 'Kylen håller inte kylan, bifogar bild på displayen.');
await page.click('button:has-text("Nästa")');

await page.setInputFiles('input[type=file]', IMAGE_PATH);
await page.waitForSelector('.attachment img', { timeout: 45000 });
await page.waitForTimeout(1200);

const toast = await page.locator('.toast').first().textContent().catch(() => null);
const original = originalBytes;
console.log('Originalfil:      ', (original / 1024 / 1024).toFixed(2), 'MB (3600×2400)');
console.log('Uppladdat:        ', (uploadedBytes / 1024 / 1024).toFixed(2), 'MB');
console.log('Minskning:        ', Math.round((1 - uploadedBytes / original) * 100), '%');
console.log('Besked i appen:   ', toast?.trim().split('\n')[0] ?? '(inget)');
console.log(uploadedBytes > 0 && uploadedBytes < original / 4 ? '✓ Nedskalningen fungerar' : '✗ Nedskalningen gav inte effekt');
await browser.close();
