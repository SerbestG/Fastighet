/**
 * Entreprenörsportalen.
 *
 * Körs mot en igång­varande miljö (se e2e/README.md). Varje steg skrivs ut i
 * terminalen och sparar en skärmbild i e2e/screenshots.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

mkdirSync('e2e/screenshots', { recursive: true });
const B = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const shot=(p,n)=>p.screenshot({path:`e2e/screenshots/${n}.png`,fullPage:true});
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const ctx = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,locale:'sv-SE'});
ctx.setDefaultTimeout(8000);
const page = await ctx.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));
page.on('response', r => { if (r.status()>=400 && r.url().includes('/api/')) errors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`); });
const step=async(l,f)=>{process.stdout.write(`• ${l} … `);try{await f();console.log('ok');}catch(e){console.log('FEL: '+e.message.split('\n')[0]);}};

await step('logga in som entreprenör', async () => {
  await page.goto(B,{waitUntil:'networkidle'});
  await page.fill('input[type=email]','tobias.strom@demo-stromochror.se');
  await page.fill('input[type=password]','Demolosenord123!');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Entreprenörsportal',{timeout:15000});
  await page.waitForTimeout(1000);
  await shot(page,'p01-portal');
});

await step('kontaktuppgifter döljs innan uppdraget accepterats', async () => {
  const text = await page.textContent('main');
  if(!text.includes('Kontaktuppgifter lämnas ut när du accepterat')) throw new Error('kontaktspärr saknas');
});

await step('acceptera uppdraget', async () => {
  await page.click('button:has-text("Acceptera")');
  await page.waitForTimeout(2000);
  const text = await page.textContent('main');
  if(!text.includes('Ring')) throw new Error('kontaktuppgifter visas inte efter accept');
  await shot(page,'p03-accepted');
});

await step('registrera ankomst', async () => {
  await page.click('button:has-text("Registrera ankomst")');
  await page.waitForTimeout(2000);
  await shot(page,'p04-onsite');
});

await step('rapportera hinder', async () => {
  await page.click('button:has-text("Rapportera hinder")');
  await page.waitForSelector('.sheet',{timeout:5000});
  await page.fill('.sheet textarea','Kommer inte in i schaktet, nyckel saknas till städskrubben.');
  await shot(page,'p05-blocker');
  await page.click('.sheet button:has-text("Skicka")');
  await page.waitForTimeout(2000);
  await shot(page,'p06-blocked');
});

await step('markera som klar med tid och material', async () => {
  await page.click('button:has-text("Registrera ankomst")');
  await page.waitForTimeout(1500);
  await page.click('button:has-text("Markera som klar")');
  await page.waitForSelector('.sheet',{timeout:5000});
  await page.fill('.sheet textarea','Bytte termostat och kontrollerade tätningslisten.');
  const inputs = page.locator('.sheet input[inputmode]');
  await inputs.nth(0).fill('1,5');
  await page.fill('.sheet input >> nth=1','Termostat');
  await shot(page,'p07-complete-form');
  await page.click('.sheet button:has-text("Markera som klar")');
  await page.waitForTimeout(2500);
  await shot(page,'p08-completed');
});

console.log('\nFel:', errors.length?errors:'inga');
await browser.close();
