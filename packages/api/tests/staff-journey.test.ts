import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, closeApp, get, login, patch, post, type Session } from './helpers.js';

/** Förvaltarens, kundservicens och entreprenörens arbetsflöden. */
describe('Personalens och entreprenörens resa', () => {
  let tenant: Session;
  let admin: Session;
  let contractor: Session;
  let caseId: string;
  let workOrderId: string;

  beforeAll(async () => {
    tenant = await login(ACCOUNTS.orgA.tenant);
    admin = await login(ACCOUNTS.orgA.admin);
    contractor = await login(ACCOUNTS.orgA.contractor);
  });

  afterAll(async () => {
    await closeApp();
  });

  it('förvaltaren ser nyckeltal som går att spåra till underlaget', async () => {
    const dashboard = await get<{
      kpis: { key: string; value: number; drilldown: { view: string; filters: Record<string, unknown> } }[];
      serviceLevels: { avgResponseHours: number | null; measuredCases: number };
      casesPerProperty: { property_name: string }[];
    }>(admin, '/api/staff/dashboard');
    expect(dashboard.status).toBe(200);

    const open = dashboard.body.kpis.find((kpi) => kpi.key === 'open')!;
    expect(open.drilldown.view).toBe('cases');

    // Talet ska stämma med vad ärendeinkorgen faktiskt returnerar.
    const params = new URLSearchParams();
    for (const status of open.drilldown.filters.status as string[]) params.append('status', status);
    params.set('limit', '100');
    const inbox = await get<{ total: number }>(admin, `/api/staff/cases?${params.toString()}`);
    expect(inbox.body.total).toBe(open.value);
  });

  it('tar emot en felanmälan och fördelar den', async () => {
    const created = await post<{ case: { id: string } }>(tenant, '/api/cases', {
      locationKind: 'residence',
      categoryKey: 'appliances',
      subcategoryKey: 'fridge_freezer',
      space: 'kitchen',
      description: 'Kylen håller inte kylan.',
      triageAnswers: { not_cooling: 'yes', leaking: 'no' },
    });
    caseId = created.body.case.id;

    const assignees = await get<{ assignees: { id: string }[] }>(admin, '/api/staff/assignees');
    const assigned = await patch<{ updated: boolean }>(admin, `/api/staff/cases/${caseId}`, {
      assigneeId: assignees.body.assignees[0]!.id,
    });
    expect(assigned.body.updated).toBe(true);

    const detail = await get<{ case: { status: string; assignee_id: string | null } }>(
      admin,
      `/api/staff/cases/${caseId}`,
    );
    expect(detail.body.case.status).toBe('assigned');
    expect(detail.body.case.assignee_id).toBeTruthy();
  });

  it('otillåtna statusövergångar avvisas', async () => {
    const invalid = await patch<{ error: { code: string } }>(admin, `/api/staff/cases/${caseId}`, {
      status: 'closed',
    });
    expect(invalid.status).toBe(409);
  });

  it('hittar liknande ärenden i samma byggnad och kan slå ihop dem', async () => {
    const duplicate = await post<{ case: { id: string } }>(tenant, '/api/cases', {
      locationKind: 'residence',
      categoryKey: 'appliances',
      subcategoryKey: 'fridge_freezer',
      space: 'kitchen',
      description: 'Kylen fungerar fortfarande inte.',
      triageAnswers: { not_cooling: 'yes', leaking: 'no' },
    });

    const detail = await get<{ similarInBuilding: { id: string }[] }>(admin, `/api/staff/cases/${caseId}`);
    expect(detail.body.similarInBuilding.some((row) => row.id === duplicate.body.case.id)).toBe(true);

    const merged = await post<{ merged: number }>(admin, `/api/staff/cases/${caseId}/merge`, {
      sourceCaseIds: [duplicate.body.case.id],
      reason: 'Samma fel, samma bostad.',
    });
    expect(merged.body.merged).toBe(1);

    const after = await get<{ case: { status: string } }>(admin, `/api/staff/cases/${duplicate.body.case.id}`);
    expect(after.body.case.status).toBe('closed');
  });

  it('skapar en arbetsorder till en entreprenör', async () => {
    const contractors = await get<{ contractors: { id: string }[] }>(admin, '/api/staff/contractors');
    const created = await post<{ id: string; number: string }>(admin, '/api/staff/work-orders', {
      caseId,
      contractorOrgId: contractors.body.contractors[0]!.id,
      title: 'Byt kyl och frys',
      instructions: 'Kontrollera termostaten först.',
    });
    expect(created.status).toBe(200);
    expect(created.body.number).toMatch(/^AO-/);
    workOrderId = created.body.id;
  });

  it('entreprenören ser inte hyresgästens kontaktuppgifter före accept', async () => {
    const before = await get<{ workOrders: { id: string; contact_phone: string | null }[] }>(
      contractor,
      '/api/partner/work-orders',
    );
    const order = before.body.workOrders.find((row) => row.id === workOrderId)!;
    expect(order.contact_phone).toBeNull();

    await patch(contractor, `/api/partner/work-orders/${workOrderId}`, { status: 'accepted' });

    const after = await get<{ workOrders: { id: string; contact_phone: string | null }[] }>(
      contractor,
      '/api/partner/work-orders',
    );
    const accepted = after.body.workOrders.find((row) => row.id === workOrderId)!;
    expect(accepted.contact_phone).toBeTruthy();
  });

  it('entreprenören registrerar ankomst, hinder och slutför', async () => {
    expect((await patch(contractor, `/api/partner/work-orders/${workOrderId}`, { status: 'on_site' })).status).toBe(200);

    const blocked = await patch<{ error?: { code: string } }>(contractor, `/api/partner/work-orders/${workOrderId}`, {
      status: 'blocked',
    });
    // Ett hinder måste beskrivas.
    expect(blocked.status).toBe(400);

    expect(
      (
        await patch(contractor, `/api/partner/work-orders/${workOrderId}`, {
          status: 'blocked',
          blockerReason: 'Reservdel saknas, beställd till i morgon.',
        })
      ).status,
    ).toBe(200);

    await patch(contractor, `/api/partner/work-orders/${workOrderId}`, { status: 'on_site' });
    const completed = await patch<{ updated: boolean }>(contractor, `/api/partner/work-orders/${workOrderId}`, {
      status: 'completed',
      minutesSpent: 95,
      notes: 'Bytte termostat.',
      materials: [{ description: 'Termostat', quantity: 1, unit: 'st', unitCostOre: 48_000 }],
    });
    expect(completed.body.updated).toBe(true);

    // Ärendet går automatiskt till klart och hyresgästen får en notis.
    const detail = await get<{ case: { status: string } }>(admin, `/api/staff/cases/${caseId}`);
    expect(detail.body.case.status).toBe('resolved');

    const notifications = await get<{ notifications: { title: string }[] }>(tenant, '/api/me/notifications');
    expect(notifications.body.notifications.some((n) => n.title.includes('klart'))).toBe(true);
  });

  it('publicerar driftinformation till en fastighet och räknar mottagarna', async () => {
    const structure = await get<{ areas: { properties: { id: string; name: string }[] }[] }>(
      admin,
      '/api/staff/structure',
    );
    const property = structure.body.areas[0]!.properties[0]!;

    const preview = await post<{ residents: number; tenancies: number }>(
      admin,
      '/api/staff/notices/preview-audience',
      { audience: [{ scope: 'property', scopeId: property.id }] },
    );
    expect(preview.body.residents).toBeGreaterThan(0);

    const published = await post<{ id: string; status: string; recipients: number }>(admin, '/api/staff/notices', {
      kind: 'elevator_fault',
      severity: 'important',
      title: 'Hissen i Hus A är ur funktion',
      bodyHtml: '<p>Felavhjälpning pågår.</p>',
      summary: 'Hissen är ur funktion.',
      audience: [{ scope: 'property', scopeId: property.id }],
      channels: ['inapp', 'push'],
      requiresAcknowledgement: true,
    });
    expect(published.body.status).toBe('published');
    expect(published.body.recipients).toBe(preview.body.residents);

    // Hyresgästen ser inlägget och kan bekräfta det.
    const notices = await get<{ operational: { id: string }[] }>(tenant, '/api/notices');
    expect(notices.body.operational.some((notice) => notice.id === published.body.id)).toBe(true);

    const acknowledged = await post<{ acknowledged: boolean }>(
      tenant,
      `/api/notices/${published.body.id}/acknowledge`,
    );
    expect(acknowledged.body.acknowledged).toBe(true);

    const receipts = await get<{ recipients: number; read: number; acknowledged: number }>(
      admin,
      `/api/staff/notices/${published.body.id}/receipts`,
    );
    expect(receipts.body.acknowledged).toBe(1);
  });

  it('schemalägger en publicering utan att skicka den direkt', async () => {
    const publishAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const scheduled = await post<{ status: string; recipients: number }>(admin, '/api/staff/notices', {
      kind: 'planned_maintenance',
      severity: 'info',
      title: 'Byte av portlås',
      bodyHtml: '<p>Nya taggar delas ut i förväg.</p>',
      audience: [{ scope: 'organisation', scopeId: null }],
      publishAt,
      channels: ['inapp'],
    });
    expect(scheduled.body.status).toBe('scheduled');
    expect(scheduled.body.recipients).toBe(0);

    const visible = await get<{ operational: { title: string }[]; news: { title: string }[] }>(tenant, '/api/notices');
    const titles = [...visible.body.operational, ...visible.body.news].map((notice) => notice.title);
    expect(titles).not.toContain('Byte av portlås');
  });

  it('spärrar en bokningsbar tid och avbokar berörda bokningar', async () => {
    const resources = await get<{ resources: { id: string; kind: string; slot_minutes: number }[] }>(
      tenant,
      '/api/booking/resources',
    );
    const laundry = resources.body.resources.find((resource) => resource.kind === 'laundry')!;
    const start = new Date();
    start.setDate(start.getDate() + 9);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + laundry.slot_minutes * 60_000);

    await post(tenant, '/api/bookings', {
      resourceId: laundry.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    });

    const blocked = await post<{ cancelledBookings: number }>(admin, '/api/staff/resource-blocks', {
      resourceId: laundry.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      reason: 'Planerat underhåll av maskinerna.',
    });
    expect(blocked.body.cancelledBookings).toBe(1);

    const notifications = await get<{ notifications: { title: string }[] }>(tenant, '/api/me/notifications');
    expect(notifications.body.notifications.some((n) => n.title.includes('avbokad'))).toBe(true);
  });

  it('en integration kan inte markeras som ansluten utan uppgifter', async () => {
    const integrations = await get<{ integrations: { id: string; kind: string }[] }>(admin, '/api/staff/integrations');
    const bankid = integrations.body.integrations.find((row) => row.kind === 'bankid')!;
    const attempt = await patch<{ error: { code: string } }>(admin, `/api/staff/integrations/${bankid.id}`, {
      status: 'connected',
      baseUrl: 'https://exempel.test',
    });
    expect(attempt.status).toBe(400);
  });

  it('säkerhetsloggen har fångat åtgärderna', async () => {
    const log = await get<{ entries: { action: string }[] }>(admin, '/api/staff/audit-log?limit=200');
    const actions = new Set(log.body.entries.map((entry) => entry.action));
    expect(actions.has('case.created')).toBe(true);
    expect(actions.has('case.updated')).toBe(true);
    expect(actions.has('notice.published')).toBe(true);
    expect(actions.has('auth.login')).toBe(true);
  });
});
