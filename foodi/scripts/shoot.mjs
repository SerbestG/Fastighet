// Skärmdumpar av utvalda vyer, för granskning av designen.
// Användning: node scripts/shoot.mjs [bas-url] [vy ...]
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5180/';
const only = process.argv.slice(3);
const out = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const views = [
  { name: 'home', hash: '#/' },
  { name: 'search', hash: '#/sok?q=pizza' },
  { name: 'restaurant', hash: '#/r/presto-grillen' },
  { name: 'dish', hash: '#/r/presto-grillen?ratt=pg-presto-burger', full: false },
  { name: 'napoli', hash: '#/r/napoli-forno' },
  { name: 'profile', hash: '#/profil' },
  { name: 'partner', hash: '#/partner/presto-grillen' },
  { name: 'partner-menu', hash: '#/partner/presto-grillen/meny' },
  { name: 'partner-hours', hash: '#/partner/presto-grillen/oppettider' },
  { name: 'admin', hash: '#/admin' },
  { name: 'admin-orders', hash: '#/admin/bestallningar' },
  { name: 'admin-fees', hash: '#/admin/avgifter' },
];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
for (const device of [
  { id: 'mobile', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { id: 'desktop', viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 },
]) {
  const context = await browser.newContext({ ...device, locale: 'sv-SE', timezoneId: 'Europe/Stockholm' });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`[${device.id}] pageerror:`, e.message));
  page.on('console', (m) => m.type() === 'error' && console.error(`[${device.id}] console:`, m.text()));
  for (const view of views) {
    if (only.length && !only.includes(view.name)) continue;
    await page.goto(base + view.hash);
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${out}${view.name}-${device.id}.png`, fullPage: view.full !== false });
  }
  await context.close();
}
await browser.close();
console.log('klart');
