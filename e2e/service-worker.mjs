/**
 * Kontroll av servicearbetaren.
 *
 * Det viktiga är inte att cachen finns, utan vad den inte innehåller: inga svar
 * från /api/ får sparas på enheten (krav C.5.2, C.3.12). Skriptet loggar in,
 * rör sig genom appen och granskar sedan cachens hela innehåll.
 *
 * Körs mot en byggd version, se e2e/README.md.
 */
import { chromium } from 'playwright';

const B = process.env.PREVIEW_URL ?? 'http://127.0.0.1:4173';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'sv-SE' })).newPage();

await page.goto(B, { waitUntil: 'networkidle' });
await page.waitForFunction(() => navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready, {
  timeout: 15000,
});
await page.evaluate(() => navigator.serviceWorker.ready);

await page.fill('input[type=email]', 'robin.ek@example.com');
await page.fill('input[type=password]', 'Demolosenord123!');
await page.click('button[type=submit]');
await page.waitForSelector('text=Hej Robin', { timeout: 15000 });

// Rör oss genom de vyer som hämtar personuppgifter.
for (const path of ['/arenden', '/avier', '/mitt-boende', '/meddelanden']) {
  await page.goto(B + path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
}

const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  const urls = [];
  for (const name of names) {
    const cache = await caches.open(name);
    for (const request of await cache.keys()) urls.push(request.url);
  }
  return { names, urls };
});

const apiEntries = cached.urls.filter((url) => new URL(url).pathname.startsWith('/api/'));

console.log('Cacher:            ', cached.names.join(', ') || '(inga)');
console.log('Cachade adresser:  ', cached.urls.length);
for (const url of cached.urls) console.log('   ', new URL(url).pathname);
console.log('Varav från /api/:  ', apiEntries.length);

// Appskalet ska gå att starta utan nät.
await page.context().setOffline(true);
await page.goto(B + '/arenden', { waitUntil: 'domcontentloaded' }).catch(() => {});
const startedOffline = await page.locator('#root').count();
await page.context().setOffline(false);

console.log('Startar utan nät:  ', startedOffline > 0 ? 'ja' : 'nej');
console.log(
  apiEntries.length === 0 && cached.urls.length > 0 && startedOffline > 0
    ? '✓ Appskalet cachas, inga uppgifter sparas på enheten'
    : '✗ Kontrollen misslyckades',
);

await browser.close();
process.exit(apiEntries.length === 0 ? 0 : 1);
