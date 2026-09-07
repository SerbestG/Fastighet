import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sanitiseHtml, extractMain } from '../src/core/sanitise.js';
import { createAdminPool } from '../src/db/pool.js';
import { ACCOUNTS, type Session, get, login, patch, post } from './helpers.js';

/**
 * Spegling av webbplatsinnehåll (krav B.1.26) och profiluppdatering som förs
 * vidare till fastighetssystemet (krav B.1.27).
 */

describe('Rensning av hämtad HTML', () => {
  it('tar bort skript med innehåll och allt', () => {
    const result = sanitiseHtml('<p>Hej</p><script>stealCookies()</script><p>Då</p>');
    expect(result.html).toBe('<p>Hej</p><p>Då</p>');
    expect(result.html).not.toContain('steal');
    expect(result.removed).toContain('script');
  });

  it('tar bort händelseattribut och stilar', () => {
    const result = sanitiseHtml('<p onclick="alert(1)" style="color:red">Text</p>');
    expect(result.html).toBe('<p>Text</p>');
  });

  it('släpper inte igenom javascript-adresser', () => {
    const result = sanitiseHtml('<a href="javascript:alert(1)">Klicka</a>');
    expect(result.html).not.toContain('javascript');
    expect(result.html).toContain('Klicka');
  });

  it('behåller länkar men gör dem säkra', () => {
    const result = sanitiseHtml('<a href="https://exempel.se/sida">Läs mer</a>');
    expect(result.html).toContain('href="https://exempel.se/sida"');
    expect(result.html).toContain('rel="noopener noreferrer"');
  });

  it('gör relativa adresser absoluta', () => {
    const result = sanitiseHtml('<a href="/kontakt">Kontakt</a>', {
      baseUrl: 'https://exempel.se/info/',
    });
    expect(result.html).toContain('https://exempel.se/kontakt');
  });

  it('tar bort inbäddade ramar och formulär', () => {
    const result = sanitiseHtml('<iframe src="https://ond.example"></iframe><form><input /></form><p>Kvar</p>');
    expect(result.html).toBe('<p>Kvar</p>');
  });

  it('kodar text som ser ut som markup', () => {
    const result = sanitiseHtml('<p>1 &lt; 2 och a > b</p>');
    expect(result.html).not.toContain('<b>');
    expect(result.html).toContain('&gt;');
  });

  it('plockar ut brödtexten ur ett helt dokument', () => {
    const html = '<html><head><title>T</title></head><body><nav>Meny</nav><main><p>Brödtext</p></main></body></html>';
    expect(sanitiseHtml(extractMain(html)).html).toBe('<p>Brödtext</p>');
  });
});

/* ------------------------------------------------------- hela flödet --- */

let server: Server;
let origin: string;
let admin: Session;

const PAGE = `
<html><body><main>
  <h2>Så sorterar du</h2>
  <p>Matavfall i den bruna påsen. <a href="/avfall">Läs mer om avfall</a>.</p>
  <script>document.cookie</script>
</main></body></html>`;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/sortering') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(PAGE);
      return;
    }
    response.writeHead(404);
    response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('kunde inte starta testservern');
  origin = `http://127.0.0.1:${address.port}`;

  // Bolagets webbplats pekas om till testservern.
  const pool = createAdminPool();
  try {
    await pool.query('update organisations set website_url = $1 where slug = $2', [
      origin,
      ACCOUNTS.orgA.slug,
    ]);
  } finally {
    await pool.end();
  }

  admin = await login(ACCOUNTS.orgA.admin);
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('Spegling av webbplatsinnehåll', () => {
  it('vägrar adresser utanför bolagets webbplats', async () => {
    const result = await post(admin, '/api/staff/mirrored-pages', {
      title: 'Något annat',
      sourceUrl: 'https://annan-plats.example/sida',
    });
    expect(result.status).toBe(400);
    expect(JSON.stringify(result.body)).toMatch(/ligga på/i);
  });

  it('vägrar adresser som inte är https', async () => {
    // Testservern kör http, vilket avvisas av samma skäl som en främmande värd.
    const result = await post(admin, '/api/staff/mirrored-pages', {
      title: 'Sortering',
      sourceUrl: `${origin}/sortering`,
    });
    expect(result.status).toBe(400);
    expect(JSON.stringify(result.body)).toMatch(/https/i);
  });
});

describe('Profiluppdatering mot fastighetssystemet', () => {
  it('lägger ändrade kontaktuppgifter i kön även utan anslutning', async () => {
    const tenant = await login(ACCOUNTS.orgA.tenant);
    const before = await get<{ user: { phone: string | null } }>(tenant, '/api/me');
    const nyttNummer = before.body.user.phone === '070-999 88 77' ? '070-111 22 33' : '070-999 88 77';

    const result = await patch<{ propertySystemSync: { status: string } }>(tenant, '/api/me', {
      phone: nyttNummer,
    });
    expect(result.status).toBe(200);
    // Fastighetssystemet är inte anslutet i demodata, och det syns i svaret.
    expect(result.body.propertySystemSync.status).toBe('waiting');

    const pool = createAdminPool();
    try {
      const rows = await pool.query<{ kind: string; status: string; payload: { phone: string } }>(
        `select kind, status, payload from integration_outbox
          where entity_id = $1 order by created_at desc limit 1`,
        [tenant.userId],
      );
      expect(rows.rows[0]!.kind).toBe('customer.contact_updated');
      expect(rows.rows[0]!.status).toBe('blocked_no_integration');
      expect(rows.rows[0]!.payload.phone).toBe(nyttNummer);
    } finally {
      await pool.end();
    }
  });

  it('en ändring som inte rör kontaktuppgifter köar ingenting', async () => {
    const tenant = await login(ACCOUNTS.orgA.tenant);
    const result = await patch<{ propertySystemSync: { status: string } }>(tenant, '/api/me', {
      locale: 'sv',
    });
    expect(result.body.propertySystemSync.status).toBe('not_needed');
  });
});
