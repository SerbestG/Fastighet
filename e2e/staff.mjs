/**
 * Förvaltarens arbetsyta.
 *
 * Körs mot en igång­varande miljö (se e2e/README.md). Varje steg skrivs ut i
 * terminalen och sparar en skärmbild i e2e/screenshots.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

mkdirSync('e2e/screenshots', { recursive: true });
import { createHmac } from 'node:crypto';
import { execSync } from 'node:child_process';

const B = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const shot = (page, name) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret) {
  let bits = '';
  for (const c of secret.toUpperCase()) { const i = B32.indexOf(c); if (i >= 0) bits += i.toString(2).padStart(5, '0'); }
  const bytes = []; for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const buf = Buffer.alloc(8); buf.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 1000 / 30)));
  const d = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const off = d[d.length - 1] & 0x0f;
  const bin = ((d[off] & 0x7f) << 24) | ((d[off + 1] & 0xff) << 16) | ((d[off + 2] & 0xff) << 8) | (d[off + 3] & 0xff);
  return String(bin % 1000000).padStart(6, '0');
}
const secret = execSync(`su postgres -c "psql -d hemvist -tAc \\"select mfa_secret from users where email='anna.lindqvist@demo-botkyrkabyggen.se'\\""`).toString().trim();

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'sv-SE' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('/api/')) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });

const step = async (label, fn) => {
  process.stdout.write(`• ${label} … `);
  try { await fn(); console.log('ok'); } catch (e) { console.log('FEL: ' + e.message.split('\n')[0]); }
};

await step('logga in som administratör med engångskod', async () => {
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', 'anna.lindqvist@demo-botkyrkabyggen.se');
  await page.fill('input[type=password]', 'Demolosenord123!');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Engångskod', { timeout: 10000 });
  await shot(page, 's01-mfa');
  await page.fill('input[inputmode=numeric]', totp(secret));
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Öppna ärenden', { timeout: 15000 });
  await shot(page, 's02-dashboard');
});

await step('nyckeltal går att öppna till underlaget', async () => {
  await page.click('.kpi:has-text("Akuta ärenden")');
  await page.waitForSelector('text=Ärendeinkorg', { timeout: 10000 });
  const url = page.url();
  if (!url.includes('priority=emergency')) throw new Error('drilldown saknar filter: ' + url);
  await shot(page, 's03-inbox-drilldown');
});

await step('växla mellan vyerna i inkorgen', async () => {
  await page.goto(B + '/arenden', { waitUntil: 'networkidle' });
  await page.waitForSelector('table.data', { timeout: 10000 });
  await shot(page, 's04-inbox-list');
  await page.click('button[role=tab]:has-text("Tavla")');
  await page.waitForSelector('.board', { timeout: 5000 });
  await shot(page, 's05-inbox-board');
  await page.click('button[role=tab]:has-text("Karta")');
  await page.waitForTimeout(500);
  await shot(page, 's06-inbox-map');
  await page.click('button[role=tab]:has-text("Statistik")');
  await page.waitForTimeout(500);
  await shot(page, 's07-inbox-stats');
  await page.click('button[role=tab]:has-text("Kalender")');
  await page.waitForTimeout(500);
  await shot(page, 's08-inbox-calendar');
});

await step('öppna ett ärende och fördela det', async () => {
  await page.click('button[role=tab]:has-text("Lista")');
  await page.waitForSelector('table.data tbody tr', { timeout: 5000 });
  await page.click('table.data tbody tr');
  await page.waitForSelector('text=Åtgärder', { timeout: 10000 });
  await shot(page, 's09-case-detail');
  await page.selectOption('select >> nth=1', { index: 1 });
  await page.waitForTimeout(1500);
  await shot(page, 's10-case-assigned');
});

await step('svara hyresgästen och spara intern anteckning', async () => {
  await page.click('button[role=tab]:has-text("Dialog")');
  await page.waitForSelector('text=Svar till hyresgäst', { timeout: 5000 });
  const areas = page.locator('textarea');
  await areas.nth(0).fill('Vi har skickat en rörmokare som är hos dig i eftermiddag.');
  await page.click('button:has-text("Skicka")');
  await page.waitForTimeout(1500);
  await areas.nth(1).fill('Kontrollera stammen samtidigt.');
  await page.click('button:has-text("Spara anteckning")');
  await page.waitForTimeout(1500);
  await shot(page, 's11-case-dialog');
});

await step('skapa och publicera driftinformation', async () => {
  await page.goto(B + '/utskick', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Nytt inlägg', { timeout: 10000 });
  await shot(page, 's12-notices');
  await page.click('button:has-text("Nytt inlägg")');
  await page.waitForSelector('.sheet', { timeout: 5000 });
  await page.fill('.sheet input >> nth=0', 'Hissen i Hus A är ur funktion');
  await page.fill('.sheet input >> nth=1', 'Felavhjälpning pågår, beräknas klart i morgon.');
  await page.fill('.sheet textarea', 'Hissen står stilla sedan i morse.\n\nEn tekniker är på plats. Vi meddelar när den fungerar igen.');
  await page.selectOption('.sheet select >> nth=0', 'elevator_fault');
  await page.click('.sheet label:has-text("Alla hyresgäster")');
  await page.waitForSelector('text=hyresgäster berörs', { timeout: 10000 });
  await shot(page, 's13-notice-composer');
  await page.click('button:has-text("Förhandsgranska")');
  await page.waitForSelector('.phone-preview', { timeout: 5000 });
  await shot(page, 's14-notice-preview');
  await page.click('button:has-text("Publicera nu")');
  await page.waitForTimeout(2500);
  await shot(page, 's15-notice-published');
});

await step('fastighetsstruktur med sök', async () => {
  await page.goto(B + '/fastigheter', { waitUntil: 'networkidle' });
  await page.waitForSelector('table.data', { timeout: 10000 });
  await shot(page, 's16-properties');
});

await step('integrationsregister', async () => {
  await page.goto(B + '/integrationer', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Kräver konfiguration', { timeout: 10000 });
  await shot(page, 's17-integrations');
});

await step('säkerhetslogg', async () => {
  await page.goto(B + '/sakerhetslogg', { waitUntil: 'networkidle' });
  await page.waitForSelector('table.data', { timeout: 10000 });
  await shot(page, 's18-audit');
});

await step('inställningar med profil och moduler', async () => {
  await page.goto(B + '/installningar', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Funktioner i appen', { timeout: 10000 });
  await shot(page, 's19-settings');
});

await step('användare och roller', async () => {
  await page.goto(B + '/anvandare', { waitUntil: 'networkidle' });
  await page.waitForSelector('table.data', { timeout: 10000 });
  await shot(page, 's20-users');
});

console.log('\nFel:', errors.length ? errors.slice(0, 10) : 'inga');
await browser.close();
