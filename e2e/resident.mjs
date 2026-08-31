/**
 * Hyresgästens resa, steg för steg.
 *
 * Körs mot en igång­varande miljö (se e2e/README.md). Varje steg skrivs ut i
 * terminalen och sparar en skärmbild i e2e/screenshots.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

mkdirSync('e2e/screenshots', { recursive: true });

const B = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const shot = (page, name) => page.screenshot({ path: `e2e/screenshots/${name}.png`, fullPage: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'sv-SE' });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });

const step = async (label, fn) => {
  process.stdout.write(`• ${label} … `);
  try { await fn(); console.log('ok'); } catch (e) { console.log('FEL: ' + e.message.split('\n')[0]); }
};

await step('öppna inloggning', async () => {
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Logga in', { timeout: 10000 });
  await shot(page, '01-login');
});

await step('logga in som hyresgäst', async () => {
  await page.fill('input[type=email]', 'robin.ek@example.com');
  await page.fill('input[type=password]', 'Demolosenord123!');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Hej Robin', { timeout: 15000 });
  await shot(page, '02-home');
});

await step('startsidan visar rätt boende och aktuellt', async () => {
  const address = await page.textContent('.home-address .address');
  if (!address.includes('Albyvägen')) throw new Error('fel adress: ' + address);
  const feed = await page.textContent('section[aria-labelledby=aktuellt]');
  if (!feed.includes('Vattnet stängs av')) throw new Error('driftinfo saknas i flödet');
});

await step('öppna driftmeddelande', async () => {
  await page.click('text=Vattnet stängs av på torsdag');
  await page.waitForSelector('text=Starttid', { timeout: 10000 });
  await shot(page, '03-notice');
});

await step('starta felanmälan', async () => {
  await page.goto(B + '/arenden/nytt', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Var finns problemet?', { timeout: 10000 });
  await shot(page, '04-case-step1');
  await page.click('text=I bostaden');
  await page.click('button:has-text("Nästa")');
  await page.waitForSelector('text=Vatten och avlopp', { timeout: 5000 });
  await shot(page, '05-case-categories');
  await page.click('.choice-card:has-text("Vatten och avlopp")');
  await page.click('.choice-card:has-text("Vattenläcka")');
  await page.click('button:has-text("Nästa")');
});

await step('följdfrågor styr till akut', async () => {
  await page.waitForSelector('text=Pågår läckan just nu?', { timeout: 5000 });
  await page.click('fieldset:has-text("Pågår läckan just nu?") .chip:has-text("Ja")');
  await page.click('fieldset:has-text("Går det att stänga av vattnet?") .chip:has-text("Nej")');
  await page.click('fieldset:has-text("person- eller egendomsskada") .chip:has-text("Ja")');
  await page.waitForSelector('text=Det här verkar brådskande', { timeout: 5000 });
  await page.fill('textarea', 'Det står vatten på golvet i badrummet och droppar från röret hela tiden.');
  await shot(page, '06-case-triage-emergency');
});

await step('gå igenom resten av guiden och skicka', async () => {
  await page.click('button:has-text("Nästa")'); // bilder
  await shot(page, '07-case-photos');
  await page.click('button:has-text("Nästa")'); // tillträde
  await page.click('label:has-text("huvudnyckel")');
  await shot(page, '08-case-access');
  await page.click('button:has-text("Nästa")'); // sammanfattning
  await page.waitForSelector('text=Prioritet', { timeout: 5000 });
  await shot(page, '09-case-review');
  await page.click('button:has-text("Skicka felanmälan")');
  await page.waitForSelector('text=Händelser', { timeout: 15000 });
  await shot(page, '10-case-detail');
});

await step('ärendelistan visar det nya ärendet', async () => {
  await page.goto(B + '/arenden', { waitUntil: 'networkidle' });
  await page.waitForSelector('.list-item', { timeout: 10000 });
  const text = await page.textContent('.card');
  if (!text.includes('Vattenläcka')) throw new Error('nytt ärende saknas i listan');
  await shot(page, '11-cases');
});

await step('boka tvättstuga', async () => {
  await page.goto(B + '/boka', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Bokningsbara resurser', { timeout: 10000 });
  await shot(page, '12-booking');
  await page.click('.list-item:has-text("Tvättstuga")');
  await page.waitForSelector('.slot-grid', { timeout: 10000 });
  await shot(page, '13-slots');
  // Dagens tider har redan passerat i demodata; välj en dag längre fram.
  await page.locator('.day-chip').nth(3).click();
  await page.waitForTimeout(500);
  const free = page.locator('.slot[data-status=available]').first();
  await free.click();
  await page.waitForSelector('text=Bekräfta bokning', { timeout: 5000 });
  await shot(page, '14-booking-confirm');
  await page.click('.sheet button:has-text("Bekräfta bokning")');
  await page.waitForTimeout(2500);
  await shot(page, '15-booking-done');
});

await step('avier med OCR och betalinformation', async () => {
  await page.goto(B + '/avier', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=OCR-nummer', { timeout: 10000 });
  const text = await page.textContent('body');
  if (!text.includes('Betalning i appen är inte aktiverad')) throw new Error('betalstatus saknas');
  await shot(page, '16-invoices');
});

await step('mitt boende', async () => {
  await page.goto(B + '/mitt-boende', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Objektnummer', { timeout: 10000 });
  await shot(page, '17-myhome');
});

await step('mer-menyn och profil', async () => {
  await page.goto(B + '/mer', { waitUntil: 'networkidle' });
  await shot(page, '18-more');
  await page.goto(B + '/profil', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Notiser', { timeout: 10000 });
  await shot(page, '19-profile');
});

await step('flytt-checklista', async () => {
  await page.goto(B + '/flytt', { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Checklista, text=Inflyttning', { timeout: 10000 }).catch(() => {});
  await shot(page, '20-moving');
});

console.log('\nKonsolfel:', errors.length ? errors.slice(0, 8) : 'inga');
await browser.close();
