// Går igenom kundens hela flöde och personalens svar i en riktig webbläsare.
// Användning: node scripts/e2e.mjs [bas-url]   (kräver att appen körs, t.ex. npm run dev)
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:5180/';
const out = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? '/opt/pw-browsers/chromium' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'sv-SE',
  timezoneId: 'Europe/Stockholm',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
});

const step = async (name, fn) => {
  process.stdout.write(`• ${name} … `);
  await fn();
  console.log('ok');
};
const shot = (name) => page.screenshot({ path: `${out}flow-${name}.png` });

await page.goto(base + '#/');
await page.evaluate(() => localStorage.clear());
await page.goto(base + '#/');

await step('startsidan visar restauranger', async () => {
  await page.getByRole('heading', { name: 'Vad blir det idag?' }).waitFor();
  await page.locator('.r-card').first().waitFor();
});

await step('sök hittar rätter', async () => {
  await page.goto(base + '#/sok?q=köttbullar');
  await page.getByRole('heading', { name: 'Rätter' }).waitFor();
  await page.locator('.dish-result', { hasText: 'Köttbullar' }).first().waitFor();
});

await step('öppnar Presto Grillen och rätten Presto Burger', async () => {
  await page.goto(base + '#/r/presto-grillen');
  await page.getByRole('heading', { name: 'Presto Grillen', level: 1 }).waitFor();
  await page.locator('.dish-row', { hasText: 'Presto Burger' }).getByRole('button', { name: /Lägg till Presto Burger/ }).click();
  await page.getByRole('dialog').waitFor();
});

await step('väljer bort lök, lägger till extra ost och dryck', async () => {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /Lök, ingår/ }).click();
  await dialog.getByRole('checkbox', { name: /Extra ost/ }).click();
  await dialog.getByRole('radio', { name: /Coca-Cola 33 cl/ }).click();
  await dialog.getByRole('button', { name: /Lägg till\s*164/ }).waitFor();
  await shot('dish');
  await dialog.getByRole('button', { name: /Lägg till\s*164/ }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached' });
});

await step('snabbtillägg av pommes via arket', async () => {
  await page.locator('.dish-row', { hasText: 'Coca-Cola Zero' }).getByRole('button', { name: /Lägg till/ }).click();
  await page.locator('.cart-bar').getByText('2 rätter').waitFor();
  await shot('restaurant-cart');
});

await step('kassan visar rätt totalsumma', async () => {
  await page.locator('.cart-bar a').click();
  await page.getByRole('heading', { name: 'Kassa' }).waitFor();
  // 164 + 29 = 193, serviceavgift 3 % = 6, totalt 199.
  await page.locator('.pay-bar').getByText('199 kr').waitFor();
  await page.locator('.co-line', { hasText: 'Presto Burger' }).getByText('Utan lök').waitFor();
});

await step('validerar uppgifterna innan betalning', async () => {
  await page.locator('.pay-bar').getByRole('button', { name: /Betala/ }).click();
  await page.getByText('Ange ett svenskt mobilnummer').waitFor();
});

await step('fyller i uppgifter och betalar med Swish (simulerat)', async () => {
  await page.getByLabel('Namn').fill('Robin');
  await page.getByLabel('Mobilnummer').fill('070-123 45 67');
  // Om restaurangen är stängd just nu väljs första lediga tid i stället.
  if (await page.getByRole('radio', { name: /Så snart som möjligt/ }).isDisabled()) {
    await page.locator('.slot').first().click();
  }
  await shot('checkout');
  await page.locator('.pay-bar').getByRole('button', { name: /Betala/ }).click();
  await page.getByText('Simulerad betalning · inga pengar dras').waitFor();
  await page.getByRole('heading', { name: /Tack Robin/ }).waitFor({ timeout: 8000 });
  await shot('order-placed');
});

await step('demorestaurangen bekräftar och lagar maten', async () => {
  await page.locator('.progress__step.is-done', { hasText: 'Mottagen' }).waitFor({ timeout: 12000 });
  await page.getByText(/har tagit emot din beställning/).first().waitFor();
  await page.getByRole('button', { name: /Nästa steg/ }).click();
  await page.locator('.progress__step.is-current', { hasText: 'Förbereds' }).waitFor();
  await page.getByRole('button', { name: /Nästa steg/ }).click();
  await page.locator('.pass--ready').waitFor();
  await shot('order-ready');
});

await step('kunden hämtar och betygsätter', async () => {
  await page.getByRole('button', { name: /Jag har hämtat maten/ }).click();
  await page.getByRole('button', { name: '5 av 5 stjärnor' }).click();
  await page.getByText(/Du gav 5 av 5/).waitFor();
});

await step('beställningen syns under Beställningar', async () => {
  await page.goto(base + '#/bestallningar');
  await page.locator('.order-row', { hasText: 'Presto Grillen' }).waitFor();
});

await step('personalen styr en beställning när autosvaret är av', async () => {
  await page.goto(base + '#/partner/napoli-forno');
  const autopilot = page.getByLabel('Autosvar (demo)');
  if (await autopilot.isChecked()) await autopilot.uncheck();
  await page.goto(base + '#/r/napoli-forno');
  await page.locator('.dish-row', { hasText: 'Tiramisu' }).getByRole('button', { name: /Lägg till/ }).click();
  await page.locator('.cart-bar a').click();
  if (await page.getByRole('radio', { name: /Så snart som möjligt/ }).isDisabled()) {
    await page.locator('.slot').first().click();
  }
  await page.locator('.pay-bar').getByRole('button', { name: /Betala/ }).click();
  await page.getByRole('heading', { name: /Tack Robin/ }).waitFor({ timeout: 8000 });
  const number = (await page.locator('.pass__number').textContent())?.trim();
  await page.getByRole('link', { name: /Öppna restaurangvyn/ }).click();
  const ticket = page.locator('.ticket', { hasText: number });
  await ticket.getByRole('button', { name: '+10' }).click();
  await ticket.getByRole('button', { name: /Bekräfta/ }).click();
  // På mobilen visas en kolumn i taget.
  await page.getByRole('tab', { name: /Pågående/ }).click();
  await ticket.getByRole('button', { name: /Börja laga/ }).click();
  await ticket.getByRole('button', { name: /Klar att hämta/ }).click();
  await page.getByRole('tab', { name: /Klara att hämta/ }).click();
  await ticket.getByRole('button', { name: /Hämtad av kunden/ }).waitFor();
  await shot('partner');
  await page.goto(base + '#/bestallningar');
  await page.locator('.order-row', { hasText: number }).click();
  await page.locator('.pass--ready').waitFor();
  await page.getByText(/är klar att hämta på Sankt Eriksgatan 58/).waitFor();
});

await step('restaurangen markerar en rätt som slutsåld', async () => {
  await page.goto(base + '#/partner/presto-grillen/meny');
  await page.getByLabel('Pris för Köttbullar').fill('135');
  await page.getByLabel('Pris för Köttbullar').press('Enter');
  const row = page.locator('.menu-admin__row', { hasText: 'Wallenbergare' });
  await row.locator('.stock-toggle').click();
  await page.goto(base + '#/r/presto-grillen');
  await page.locator('.dish-row', { hasText: 'Wallenbergare' }).getByText('Slutsåld idag').waitFor();
  await page.locator('.dish-row', { hasText: 'Köttbullar' }).getByText('135 kr').waitFor();
});

await step('adminvyn visar nyckeltal och kundens beställningar', async () => {
  await page.goto(base + '#/admin');
  await page.getByRole('heading', { name: 'Översikt' }).waitFor();
  await page.locator('.chart svg').waitFor();
  await page.goto(base + '#/admin/bestallningar');
  await page.locator('tr', { hasText: 'Din' }).first().click();
  await page.getByRole('heading', { name: 'Händelser' }).waitFor();
  await page.keyboard.press('Escape');
  await page.goto(base + '#/admin/avgifter');
  await page.getByLabel('Serviceavgift för kunden').fill('5');
  await page.goto(base + '#/r/presto-grillen');
  await page.locator('.dish-row', { hasText: 'Coca-Cola 33 cl' }).getByRole('button', { name: /Lägg till/ }).click();
  await page.locator('.cart-bar a').click();
  await page.getByText('Serviceavgift 5 %').waitFor();
});

await browser.close();
if (errors.length) {
  console.error('\nFel i webbläsaren:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nAlla steg gick igenom.');
