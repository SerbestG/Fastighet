import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, closeApp, get, login, patch, post, type Session } from './helpers.js';

/**
 * Roller och behörigheter.
 *
 * Kontrollerar att varje roll når exakt det den ska och inget mer, och att
 * kontrollen görs i backend – inte bara genom att gränssnittet döljer val.
 */
describe('Roller och behörigheter', () => {
  let tenant: Session;
  let coResident: Session;
  let admin: Session;
  let manager: Session;
  let customerService: Session;
  let caretaker: Session;
  let contractor: Session;

  beforeAll(async () => {
    tenant = await login(ACCOUNTS.orgA.tenant);
    coResident = await login(ACCOUNTS.orgA.coResident);
    admin = await login(ACCOUNTS.orgA.admin);
    manager = await login(ACCOUNTS.orgA.manager);
    customerService = await login(ACCOUNTS.orgA.customerService);
    caretaker = await login(ACCOUNTS.orgA.caretaker);
    contractor = await login(ACCOUNTS.orgA.contractor);
  });

  afterAll(async () => {
    await closeApp();
  });

  it('hyresgäst når inte personalens ärendeinkorg', async () => {
    expect((await get(tenant, '/api/staff/cases')).status).toBe(403);
    expect((await get(tenant, '/api/staff/dashboard')).status).toBe(403);
    expect((await get(tenant, '/api/staff/users')).status).toBe(403);
    expect((await get(tenant, '/api/staff/audit-log')).status).toBe(403);
  });

  it('entreprenör når bara sin egen portal', async () => {
    expect((await get(contractor, '/api/staff/cases')).status).toBe(403);
    expect((await get(contractor, '/api/staff/users')).status).toBe(403);
    expect((await get(contractor, '/api/staff/residents')).status).toBe(403);
    expect((await get(contractor, '/api/partner/work-orders')).status).toBe(200);
  });

  it('medboende ser boendet men inte hyresavierna', async () => {
    const home = await get<{ home: { property_street: string } | null }>(coResident, '/api/home');
    expect(home.status).toBe(200);
    expect(home.body.home?.property_street).toContain('Albyvägen');
    // Avtalet ägs av hyresgästen; medboende har inte behörighet till avierna.
    expect((await get(coResident, '/api/invoices')).status).toBe(403);
  });

  it('kundservice kan fördela men inte ändra fastighetsstrukturen', async () => {
    expect((await get(customerService, '/api/staff/cases')).status).toBe(200);
    const created = await post<{ error?: { code: string } }>(customerService, '/api/staff/areas', {
      name: 'Nytt område från kundservice',
    });
    expect(created.status).toBe(403);
  });

  it('fastighetsskötare kan avsluta ärenden men inte administrera användare', async () => {
    expect((await get(caretaker, '/api/staff/cases')).status).toBe(200);
    expect((await get(caretaker, '/api/staff/users')).status).toBe(403);
    expect((await get(caretaker, '/api/staff/settings')).status).toBe(403);
  });

  it('förvaltare kan inte ändra organisationsinställningar', async () => {
    expect((await get(manager, '/api/staff/settings')).status).toBe(403);
    expect((await patch(manager, '/api/staff/settings', { displayName: 'Kapad' })).status).toBe(403);
  });

  it('administratör når administrationen', async () => {
    expect((await get(admin, '/api/staff/settings')).status).toBe(200);
    expect((await get(admin, '/api/staff/integrations')).status).toBe(200);
    expect((await get(admin, '/api/staff/audit-log')).status).toBe(200);
  });

  it('känsliga störningsärenden kräver utökad behörighet', async () => {
    const created = await post<{ case: { id: string } }>(tenant, '/api/cases', {
      locationKind: 'residence',
      categoryKey: 'disturbance',
      subcategoryKey: 'noise',
      description: 'Hög musik från lägenheten ovanför varje natt.',
      triageAnswers: {
        ongoing: 'yes',
        feels_urgent: 'no',
        occurred_at: 'I natt runt klockan två',
        where: 'Lägenheten ovanför',
      },
    });
    expect(created.status).toBe(200);
    const caseId = created.body.case.id;

    // Kundservice saknar behörighet till känsliga ärenden.
    expect((await get(customerService, `/api/staff/cases/${caseId}`)).status).toBe(403);
    // Förvaltaren har den utökade behörigheten.
    expect((await get(manager, `/api/staff/cases/${caseId}`)).status).toBe(200);

    // Ärendet syns inte heller i kundservices lista.
    const inbox = await get<{ cases: { id: string }[] }>(customerService, '/api/staff/cases?limit=100');
    expect(inbox.body.cases.some((row) => row.id === caseId)).toBe(false);
  });

  it('personalkonton kräver tvåfaktorsautentisering', async () => {
    const { getApp } = await import('./helpers.js');
    const app = await getApp();
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: ACCOUNTS.orgA.admin, password: 'Demolosenord123!' },
    });
    expect(response.statusCode).toBe(401);
    expect((response.json() as { error: { code: string } }).error.code).toBe('mfa_required');
  });

  it('utan inloggning nekas alla skyddade anrop', async () => {
    const { getApp } = await import('./helpers.js');
    const app = await getApp();
    for (const url of ['/api/me', '/api/home', '/api/cases', '/api/staff/cases', '/api/staff/audit-log']) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(401);
    }
  });

  it('en manipulerad token avvisas', async () => {
    const { getApp } = await import('./helpers.js');
    const app = await getApp();
    const [header, payload] = tenant.accessToken.split('.');
    const response = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: `Bearer ${header}.${payload}.forfalskadsignatur` },
    });
    expect(response.statusCode).toBe(401);
  });
});
