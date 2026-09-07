/**
 * Tillgänglighetsgranskning mot WCAG 2.1 AA (krav A.2.5).
 *
 * Skriptet loggar in i alla tre gränssnitten, går igenom varje vy och kör
 * axe-core med reglerna för WCAG 2.0 och 2.1 på nivå A och AA. Resultatet
 * skrivs både i terminalen och som en rapport i docs/, så att granskningen går
 * att visa upp och köra om.
 *
 * Körs mot en igångvarande miljö, se e2e/README.md.
 */
import { execSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const B = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const AXE = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret) {
  let bits = '';
  for (const c of secret.toUpperCase()) {
    const i = B32.indexOf(c);
    if (i >= 0) bits += i.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const h = createHmac('sha1', Buffer.from(bytes)).update(buf).digest();
  const o = h[h.length - 1] & 0xf;
  const code = ((h[o] & 0x7f) << 24 | h[o + 1] << 16 | h[o + 2] << 8 | h[o + 3]) % 1e6;
  return String(code).padStart(6, '0');
}

/** Kör axe på den vy som visas just nu. */
async function audit(page, name) {
  await page.addScriptTag({ content: AXE });
  const result = await page.evaluate(
    async (tags) => await window.axe.run(document, { runOnly: { type: 'tag', values: tags } }),
    TAGS,
  );
  return {
    name,
    url: page.url().replace(/^https?:\/\/[^/]+/, ''),
    violations: result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      count: v.nodes.length,
      targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
    })),
  };
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
const results = [];

/* ------------------------------------------------------- hyresgästen --- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'sv-SE' });
  const page = await ctx.newPage();
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.selectOption('select', 'botkyrkabyggen');
  await page.waitForTimeout(400);
  results.push(await audit(page, 'Inloggning'));

  await page.fill('input[type=email]', 'robin.ek@example.com');
  await page.fill('input[type=password]', 'Demolosenord123!');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Hej Robin', { timeout: 15000 });

  const residentViews = [
    ['Startsidan', '/'],
    ['Ärenden', '/arenden'],
    ['Ny felanmälan', '/arenden/nytt'],
    ['Boka', '/boka'],
    ['Avier', '/avier'],
    ['Dokument', '/dokument'],
    ['Mitt boende', '/mitt-boende'],
    ['Driftinfo', '/driftinfo'],
    ['Meddelanden', '/meddelanden'],
    ['Flytt', '/flytt'],
    ['Enkäter', '/enkater'],
    ['Området', '/omradet'],
    ['Kontakt', '/kontakt'],
    ['Notiser', '/notiser'],
    ['Profil', '/profil'],
    ['Mer', '/mer'],
  ];
  for (const [name, path] of residentViews) {
    await page.goto(`${B}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    results.push(await audit(page, `Hyresgäst · ${name}`));
  }
  await ctx.close();
}

/* -------------------------------------------------------- personalen --- */
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'sv-SE' });
  const page = await ctx.newPage();
  const secret = execSync(
    `psql "${process.env.DATABASE_ADMIN_URL ?? 'postgresql://postgres:postgres@localhost:5432/hemvist'}" -tAc "select mfa_secret from users where email='anna.lindqvist@demo-botkyrkabyggen.se'"`,
  ).toString().trim();

  await page.goto(B, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', 'anna.lindqvist@demo-botkyrkabyggen.se');
  await page.fill('input[type=password]', 'Demolosenord123!');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Engångskod', { timeout: 15000 });
  results.push(await audit(page, 'Personal · engångskod'));

  await page.fill('input[inputmode=numeric]', totp(secret));
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Öppna ärenden', { timeout: 20000 });

  const staffViews = [
    ['Översikt', '/'],
    ['Ärendeinkorg', '/arenden'],
    ['Arbetsorder', '/arbetsorder'],
    ['Meddelanden', '/meddelanden'],
    ['Driftinfo', '/driftinfo'],
    ['Bokningar', '/bokningar'],
    ['Fastigheter', '/fastigheter'],
    ['Hyresgäster', '/hyresgaster'],
    ['Avier', '/avier'],
    ['Enkäter', '/enkater'],
    ['Användare', '/anvandare'],
    ['Integrationer', '/integrationer'],
    ['Säkerhetslogg', '/sakerhetslogg'],
    ['Inställningar', '/installningar'],
  ];
  for (const [name, path] of staffViews) {
    await page.goto(`${B}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    results.push(await audit(page, `Personal · ${name}`));
  }
  await ctx.close();
}

/* ------------------------------------------------------ entreprenören --- */
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'sv-SE' });
  const page = await ctx.newPage();
  await page.goto(B, { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', 'tobias.strom@demo-stromochror.se');
  await page.fill('input[type=password]', 'Demolosenord123!');
  await page.click('button[type=submit]');
  await page.waitForSelector('text=Entreprenörsportal', { timeout: 15000 });
  await page.waitForTimeout(600);
  results.push(await audit(page, 'Entreprenör · arbetsorder'));
  await ctx.close();
}

await browser.close();

/* -------------------------------------------------------- rapporten --- */

const all = results.flatMap((r) => r.violations.map((v) => ({ ...v, view: r.name })));
const byRule = new Map();
for (const v of all) {
  const entry = byRule.get(v.id) ?? { id: v.id, impact: v.impact, help: v.help, nodes: 0, views: new Set() };
  entry.nodes += v.count;
  entry.views.add(v.view);
  byRule.set(v.id, entry);
}

console.log(`\nGranskade ${results.length} vyer mot ${TAGS.join(', ')}.`);
if (byRule.size === 0) {
  console.log('Inga fel funna.');
} else {
  console.log(`\n${byRule.size} regler med fel:\n`);
  for (const rule of [...byRule.values()].sort((a, b) => b.nodes - a.nodes)) {
    console.log(`  ${rule.impact?.padEnd(8) ?? '        '} ${rule.id} — ${rule.help}`);
    console.log(`           ${rule.nodes} element i ${rule.views.size} vyer: ${[...rule.views].slice(0, 4).join(', ')}`);
  }
}

const lines = [
  '# Tillgänglighetsgranskning',
  '',
  `Automatisk granskning med axe-core mot ${TAGS.join(', ')}.`,
  `Kördes ${new Date().toISOString().slice(0, 10)} över ${results.length} vyer i alla tre gränssnitten.`,
  '',
  'Granskningen körs om med `node e2e/accessibility.mjs` mot en igångvarande miljö.',
  '',
  '## Resultat',
  '',
  byRule.size === 0
    ? 'Inga fel funna i någon vy.'
    : `${byRule.size} regler med fel, sammanlagt ${all.reduce((sum, v) => sum + v.count, 0)} element.`,
  '',
];

if (byRule.size > 0) {
  lines.push('| Regel | Allvarlighet | Element | Vyer |', '| --- | --- | --- | --- |');
  for (const rule of [...byRule.values()].sort((a, b) => b.nodes - a.nodes)) {
    lines.push(`| ${rule.id} — ${rule.help} | ${rule.impact ?? '–'} | ${rule.nodes} | ${[...rule.views].join(', ')} |`);
  }
  lines.push('');
}

lines.push('## Granskade vyer', '');
for (const result of results) {
  const count = result.violations.reduce((sum, v) => sum + v.count, 0);
  lines.push(`- ${result.name} (${result.url}) — ${count === 0 ? 'inga fel' : `${count} element`}`);
}
lines.push('');
lines.push('## Vad granskningen inte täcker', '');
lines.push(
  'Automatisk granskning fångar ungefär en tredjedel av kraven i WCAG. Bedömningar',
  'som kräver en människa — om en alternativtext beskriver rätt sak, om ordningen i',
  'ett formulär är begriplig, om ett felmeddelande går att förstå — ingår inte.',
  'En oberoende granskning av en tillgänglighetsexpert kvarstår därför.',
  '',
);

writeFileSync('docs/tillganglighet.md', lines.join('\n'));
console.log('\nRapport skriven till docs/tillganglighet.md');

process.exitCode = byRule.size === 0 ? 0 : 1;
