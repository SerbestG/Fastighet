import { afterAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, closeApp, get, login, patch, post, type Session } from './helpers.js';
import { getPool, withOrg } from '../src/db/pool.js';
import { createAdminPool } from '../src/db/pool.js';

/**
 * Kundseparering.
 *
 * Testerna körs med två helt åtskilda fastighetsbolag i samma databas och
 * kontrollerar att ingen väg – varken via API:et eller direkt mot databasen –
 * släpper igenom en annan organisations uppgifter.
 */
describe('Kundseparering mellan fastighetsbolag', () => {
  afterAll(async () => {
    await closeApp();
  });

  it('släpper inte igenom någon rad utan satt organisation', async () => {
    const pool = getPool();
    for (const table of ['users', 'cases', 'invoices', 'bookings', 'notices', 'documents', 'organisations']) {
      const result = await pool.query<{ count: number }>(`select count(*)::int as count from ${table}`);
      expect(result.rows[0]?.count, `${table} läckte utan organisationskontext`).toBe(0);
    }
  });

  it('applikationsrollen kan inte kringgå Row Level Security', async () => {
    const result = await getPool().query<{ rolsuper: boolean; rolbypassrls: boolean }>(
      'select rolsuper, rolbypassrls from pg_roles where rolname = current_user',
    );
    expect(result.rows[0]?.rolsuper).toBe(false);
    expect(result.rows[0]?.rolbypassrls).toBe(false);
  });

  it('en satt organisation ser bara sina egna rader, även vid explicit id', async () => {
    const admin = createAdminPool();
    const orgs = await admin.query<{ id: string; slug: string }>('select id, slug from organisations');
    await admin.end();
    const orgA = orgs.rows.find((row) => row.slug === ACCOUNTS.orgA.slug)!;
    const orgB = orgs.rows.find((row) => row.slug === ACCOUNTS.orgB.slug)!;

    await withOrg({ orgId: orgA.id }, async (client) => {
      const own = await client.query<{ count: number }>('select count(*)::int as count from users');
      expect(own.rows[0]!.count).toBeGreaterThan(0);

      const foreign = await client.query<{ count: number }>(
        'select count(*)::int as count from users where org_id = $1',
        [orgB.id],
      );
      expect(foreign.rows[0]!.count).toBe(0);

      const organisations = await client.query<{ slug: string }>('select slug from organisations');
      expect(organisations.rows.map((row) => row.slug)).toEqual([orgA.slug]);
    });
  });

  it('en skrivning kan inte placeras i en annan organisation', async () => {
    const admin = createAdminPool();
    const orgs = await admin.query<{ id: string; slug: string }>('select id, slug from organisations');
    await admin.end();
    const orgA = orgs.rows.find((row) => row.slug === ACCOUNTS.orgA.slug)!;
    const orgB = orgs.rows.find((row) => row.slug === ACCOUNTS.orgB.slug)!;

    await expect(
      withOrg({ orgId: orgA.id }, async (client) => {
        await client.query('insert into areas (org_id, name) values ($1, $2)', [orgB.id, 'Smugglat område']);
      }),
    ).rejects.toThrow();
  });

  it('säkerhetsloggen kan inte ändras eller raderas av applikationen', async () => {
    const admin = createAdminPool();
    const orgs = await admin.query<{ id: string }>("select id from organisations where slug = $1", [
      ACCOUNTS.orgA.slug,
    ]);
    await admin.end();
    const orgId = orgs.rows[0]!.id;

    await expect(
      withOrg({ orgId }, (client) => client.query("update audit_log set action = 'manipulerad'")),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      withOrg({ orgId }, (client) => client.query('delete from audit_log')),
    ).rejects.toThrow(/permission denied/i);
  });

  describe('via API:et', () => {
    let residentA: Session;
    let residentB: Session;
    let adminA: Session;
    let adminB: Session;

    it('loggar in i båda organisationerna', async () => {
      residentA = await login(ACCOUNTS.orgA.tenant);
      residentB = await login(ACCOUNTS.orgB.tenant);
      adminA = await login(ACCOUNTS.orgA.admin);
      adminB = await login(ACCOUNTS.orgB.admin);
      expect(residentA.accessToken).toBeTruthy();
      expect(adminB.accessToken).toBeTruthy();
    });

    it('varje hyresgäst ser bara sin egen adress', async () => {
      const a = await get<{ home: { property_street: string } }>(residentA, '/api/home');
      const b = await get<{ home: { property_street: string } }>(residentB, '/api/home');
      expect(a.body.home.property_street).toContain('Albyvägen');
      expect(b.body.home.property_street).toContain('Hagagatan');
    });

    it('ett ärende i bolag A är inte åtkomligt för bolag B', async () => {
      const created = await post<{ case: { id: string } }>(residentA, '/api/cases', {
        locationKind: 'residence',
        categoryKey: 'heating',
        subcategoryKey: 'no_heat',
        description: 'Kallt i hela lägenheten sedan i går kväll.',
        triageAnswers: { temperature: '18_20', radiators: 'no' },
      });
      expect(created.status).toBe(200);
      const caseId = created.body.case.id;

      // Egen organisation kommer åt ärendet.
      expect((await get(adminA, `/api/staff/cases/${caseId}`)).status).toBe(200);
      expect((await get(residentA, `/api/cases/${caseId}`)).status).toBe(200);

      // Den andra organisationen får samma svar som för ett ärende som inte finns.
      expect((await get(adminB, `/api/staff/cases/${caseId}`)).status).toBe(404);
      expect((await get(residentB, `/api/cases/${caseId}`)).status).toBe(404);
      expect((await patch(adminB, `/api/staff/cases/${caseId}`, { status: 'closed' })).status).toBe(404);
      expect((await post(residentB, `/api/cases/${caseId}/comments`, { body: 'Hej' })).status).toBe(404);
    });

    it('ärendeinkorgen innehåller bara den egna organisationens ärenden', async () => {
      const a = await get<{ cases: { property_name: string | null }[] }>(adminA, '/api/staff/cases?limit=100');
      const b = await get<{ cases: { property_name: string | null }[] }>(adminB, '/api/staff/cases?limit=100');
      const namesA = a.body.cases.map((row) => row.property_name);
      const namesB = b.body.cases.map((row) => row.property_name);
      expect(namesA.some((name) => name?.includes('Hagagatan'))).toBe(false);
      expect(namesB.some((name) => name?.includes('Albyberget'))).toBe(false);
    });

    it('användarlistorna är åtskilda', async () => {
      const a = await get<{ users: { email: string }[] }>(adminA, '/api/staff/users');
      const b = await get<{ users: { email: string }[] }>(adminB, '/api/staff/users');
      const emailsA = a.body.users.map((user) => user.email);
      const emailsB = b.body.users.map((user) => user.email);
      expect(emailsA).toContain(ACCOUNTS.orgA.admin);
      expect(emailsA).not.toContain(ACCOUNTS.orgB.admin);
      expect(emailsB).toContain(ACCOUNTS.orgB.admin);
      expect(emailsB).not.toContain(ACCOUNTS.orgA.admin);
    });

    it('driftinformation når bara berörda hyresgäster', async () => {
      const noticesA = await get<{ operational: { id: string }[] }>(residentA, '/api/notices');
      const noticeId = noticesA.body.operational[0]!.id;
      expect((await get(residentA, `/api/notices/${noticeId}`)).status).toBe(200);
      expect((await get(residentB, `/api/notices/${noticeId}`)).status).toBe(404);
    });

    it('avier och dokument är inte åtkomliga över organisationsgränsen', async () => {
      const invoices = await get<{ invoices: { id: string }[] }>(residentA, '/api/invoices');
      const invoiceId = invoices.body.invoices[0]!.id;
      expect((await get(residentA, `/api/invoices/${invoiceId}`)).status).toBe(200);
      expect((await get(residentB, `/api/invoices/${invoiceId}`)).status).toBe(404);
    });

    it('säkerhetsloggen visar bara den egna organisationens händelser', async () => {
      const a = await get<{ entries: { actor_email: string | null }[] }>(adminA, '/api/staff/audit-log?limit=200');
      const actors = new Set(a.body.entries.map((entry) => entry.actor_email));
      expect(actors.has(ACCOUNTS.orgB.admin)).toBe(false);
      expect(actors.has(ACCOUNTS.orgB.tenant)).toBe(false);
    });

    it('bokningsbara resurser hör till den egna organisationen', async () => {
      const a = await get<{ resources: { id: string }[] }>(residentA, '/api/booking/resources');
      const b = await get<{ resources: { id: string }[] }>(residentB, '/api/booking/resources');
      const idsB = new Set(b.body.resources.map((resource) => resource.id));
      expect(a.body.resources.some((resource) => idsB.has(resource.id))).toBe(false);

      // Ett försök att boka en annan organisations resurs avvisas.
      const foreign = b.body.resources[0]!;
      const attempt = await post(residentA, '/api/bookings', {
        resourceId: foreign.id,
        startsAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        endsAt: new Date(Date.now() + 3 * 86_400_000 + 3 * 3_600_000).toISOString(),
      });
      expect(attempt.status).toBe(404);
    });
  });
});
