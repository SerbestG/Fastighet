import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, closeApp, del, get, login, patch, post, type Session } from './helpers.js';

/**
 * Hela hyresgästens resa, i den ordning en verklig hyresgäst går igenom den
 * (avsnitt 27 i kravbilden). Varje steg använder API:et på samma sätt som appen.
 */
describe('Hyresgästens resa', () => {
  let resident: Session;
  let staff: Session;
  let caseId: string;
  let caseNumber: string;

  beforeAll(async () => {
    resident = await login(ACCOUNTS.orgA.tenant);
    staff = await login(ACCOUNTS.orgA.admin);
  });

  afterAll(async () => {
    await closeApp();
  });

  it('1–3. loggar in och ser rätt bostad', async () => {
    const me = await get<{ user: { email: string }; tenancies: { object_number: string }[] }>(resident, '/api/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(ACCOUNTS.orgA.tenant);
    expect(me.body.tenancies[0]!.object_number).toMatch(/^ALB-/);
  });

  it('4. läser ett driftmeddelande', async () => {
    const notices = await get<{ operational: { id: string; localized_title: string }[] }>(resident, '/api/notices');
    expect(notices.body.operational.length).toBeGreaterThan(0);
    const waterNotice = notices.body.operational.find((notice) => notice.localized_title.includes('Vattnet'));
    expect(waterNotice, 'driftmeddelandet om vattenavstängning saknas').toBeTruthy();

    const detail = await get<{ notice: { localized_title: string; contact_info: string | null } }>(
      resident,
      `/api/notices/${waterNotice!.id}`,
    );
    expect(detail.status).toBe(200);
    expect(detail.body.notice.localized_title).toContain('Vattnet');
    expect(detail.body.notice.contact_info).toBeTruthy();
  });

  it('5–6. gör en felanmälan och får en bekräftelse', async () => {
    const taxonomy = await get<{ categories: unknown[]; locations: unknown[] }>(resident, '/api/case-taxonomy');
    expect(taxonomy.body.categories.length).toBeGreaterThan(10);
    expect(taxonomy.body.locations.length).toBeGreaterThan(0);

    const created = await post<{
      case: { id: string; caseNumber: string; priority: string; escalated: boolean };
      emergency: { phone: string | null } | null;
    }>(resident, '/api/cases', {
      locationKind: 'residence',
      categoryKey: 'water_drainage',
      subcategoryKey: 'leak',
      space: 'bathroom',
      description: 'Det droppar från röret under handfatet och golvet är blött.',
      triageAnswers: { ongoing: 'yes', can_shut_off: 'no', damage_risk: 'yes' },
      allowMasterKeyAccess: true,
      accessWindows: [{ weekday: 2, from: '08:00', to: '16:00' }],
    });
    expect(created.status).toBe(200);
    caseId = created.body.case.id;
    caseNumber = created.body.case.caseNumber;

    // Svaren gör ärendet akut och hyresgästen får jourens nummer direkt.
    expect(created.body.case.priority).toBe('emergency');
    expect(created.body.case.escalated).toBe(true);
    expect(created.body.emergency?.phone).toBeTruthy();

    const notifications = await get<{ notifications: { title: string; link_id: string | null }[] }>(
      resident,
      '/api/me/notifications',
    );
    expect(notifications.body.notifications.some((n) => n.link_id === caseId)).toBe(true);
  });

  it('7. följer ärendets status', async () => {
    const detail = await get<{ case: { status: string; simpleStatus: string }; events: { kind: string }[] }>(
      resident,
      `/api/cases/${caseId}`,
    );
    expect(detail.body.case.status).toBe('received');
    expect(detail.body.case.simpleStatus).toBe('not_started');
    expect(detail.body.events.map((event) => event.kind)).toContain('created');
  });

  it('8. svarar på en fråga från förvaltaren', async () => {
    await patch(staff, `/api/staff/cases/${caseId}`, { status: 'under_review' });
    await patch(staff, `/api/staff/cases/${caseId}`, { status: 'awaiting_tenant' });
    await post(staff, `/api/cases/${caseId}/comments`, {
      body: 'Har du stängt av vattnet vid ventilen under handfatet?',
      internal: false,
    });

    const reply = await post(resident, `/api/cases/${caseId}/comments`, {
      body: 'Ja, jag har stängt av ventilen. Det droppar inte längre.',
    });
    expect(reply.status).toBe(200);

    // Hyresgästens svar öppnar ärendet igen.
    const after = await get<{ case: { status: string } }>(resident, `/api/cases/${caseId}`);
    expect(after.body.case.status).toBe('in_progress');
  });

  it('interna anteckningar visas aldrig för hyresgästen', async () => {
    await post(staff, `/api/cases/${caseId}/comments`, { body: 'Intern: ta med ny vattenlåssats.', internal: true });
    const detail = await get<{ comments: { internal: boolean; body: string }[] }>(resident, `/api/cases/${caseId}`);
    expect(detail.body.comments.some((comment) => comment.internal)).toBe(false);
    expect(detail.body.comments.some((comment) => comment.body.includes('vattenlåssats'))).toBe(false);

    const staffView = await get<{ comments: { internal: boolean }[] }>(staff, `/api/staff/cases/${caseId}`);
    expect(staffView.body.comments.some((comment) => comment.internal)).toBe(true);
  });

  it('9–10. bokar ett besök och får en påminnelse i kön', async () => {
    const resources = await get<{ resources: { id: string; kind: string; slot_minutes: number }[] }>(
      resident,
      '/api/booking/resources',
    );
    const visitResource = resources.body.resources.find((resource) => resource.kind === 'caretaker_visit')!;
    const start = new Date();
    start.setDate(start.getDate() + 2);
    start.setHours(10, 0, 0, 0);
    const end = new Date(start.getTime() + visitResource.slot_minutes * 60_000);

    const booking = await post<{ booking: { id: string; status: string } }>(resident, '/api/bookings', {
      resourceId: visitResource.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    });
    expect(booking.status).toBe(200);
    expect(booking.body.booking.status).toBe('confirmed');

    const notifications = await get<{ notifications: { topic: string }[] }>(resident, '/api/me/notifications');
    expect(notifications.body.notifications.some((n) => n.topic === 'bookings')).toBe(true);
  });

  it('11–12. bekräftar att felet är löst och lämnar återkoppling', async () => {
    await patch(staff, `/api/staff/cases/${caseId}`, { status: 'resolved' });

    const confirmed = await post<{ status: string }>(resident, `/api/cases/${caseId}/confirm-resolved`);
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.status).toBe('closed');

    const feedback = await post<{ ok: boolean }>(resident, `/api/cases/${caseId}/feedback`, {
      rating: 5,
      resolved: true,
      comment: 'Snabbt och trevligt bemötande.',
    });
    expect(feedback.status).toBe(200);
  });

  it('13. bokar tvättstuga och kan avboka', async () => {
    const resources = await get<{ resources: { id: string; kind: string; slot_minutes: number }[] }>(
      resident,
      '/api/booking/resources',
    );
    const laundry = resources.body.resources.find((resource) => resource.kind === 'laundry')!;
    const start = new Date();
    start.setDate(start.getDate() + 5);
    start.setHours(13, 0, 0, 0);
    const end = new Date(start.getTime() + laundry.slot_minutes * 60_000);

    const booking = await post<{ booking: { id: string } }>(resident, '/api/bookings', {
      resourceId: laundry.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    });
    expect(booking.status).toBe(200);

    // Dubbelbokning av samma tid avvisas.
    const other = await login(ACCOUNTS.orgA.otherTenant);
    const clash = await post<{ error?: { code: string } }>(other, '/api/bookings', {
      resourceId: laundry.id,
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
    });
    expect([404, 409]).toContain(clash.status);

    const cancelled = await del<{ status: string }>(resident, `/api/bookings/${booking.body.booking.id}`);
    expect(cancelled.body.status).toBe('cancelled');
  });

  it('14. öppnar en hyresavi med betalningsuppgifter', async () => {
    const invoices = await get<{
      invoices: { id: string; ocr: string | null; bankgiro: string | null; due_date: string; amount_ore: number }[];
      payment: { inAppPaymentAvailable: boolean; reason: string | null };
    }>(resident, '/api/invoices');
    expect(invoices.body.invoices.length).toBeGreaterThan(0);
    const invoice = invoices.body.invoices[0]!;
    expect(invoice.ocr).toBeTruthy();
    expect(invoice.bankgiro).toBeTruthy();
    expect(invoice.amount_ore).toBeGreaterThan(0);

    // Utan betalintegration påstår appen aldrig att betalning kan ske i appen.
    expect(invoices.body.payment.inAppPaymentAvailable).toBe(false);
    expect(invoices.body.payment.reason).toBeTruthy();
  });

  it('15. hämtar ett dokument', async () => {
    const documents = await get<{ documents: unknown[]; floorPlans: unknown[] }>(resident, '/api/documents');
    expect(documents.status).toBe(200);
    expect(Array.isArray(documents.body.documents)).toBe(true);
  });

  it('16. uppdaterar kontaktuppgifter', async () => {
    const updated = await patch<{
      user: { phone: string };
      propertySystemSync: { status: string; reason?: string };
    }>(resident, '/api/me', { phone: '070-999 88 77' });
    expect(updated.status).toBe(200);
    expect(updated.body.user.phone).toBe('070-999 88 77');
    // Överföringen till fastighetssystemet kräver en ansluten integration.
    expect(updated.body.propertySystemSync.status).toBe('unavailable');
  });

  it('17. genomför ett steg i inflyttningen', async () => {
    const flows = await get<{ flows: { id: string; steps: { id: string; key: string; status: string }[] }[] }>(
      resident,
      '/api/move-flows',
    );
    const step = flows.body.flows[0]!.steps.find((item) => item.status !== 'done')!;
    const updated = await patch<{ updated: boolean }>(resident, `/api/move-steps/${step.id}`, { status: 'done' });
    expect(updated.body.updated).toBe(true);
  });

  it('svarar på en enkät, och kan inte svara två gånger', async () => {
    const surveys = await get<{ surveys: { id: string; answered: boolean }[] }>(resident, '/api/surveys');
    const survey = surveys.body.surveys[0]!;
    const first = await post(resident, `/api/surveys/${survey.id}/responses`, {
      answers: { overall: 4, safety: 4, service: 5, cleaning: true, comment: 'Bra skötsel.' },
    });
    expect(first.status).toBe(200);

    const second = await post<{ error: { code: string } }>(resident, `/api/surveys/${survey.id}/responses`, {
      answers: { overall: 1, safety: 1 },
    });
    expect(second.status).toBe(409);
  });

  it('kan ladda ner sina egna uppgifter', async () => {
    const exported = await get<{ user: unknown; cases: unknown[]; bookings: unknown[] }>(resident, '/api/me/export');
    expect(exported.status).toBe(200);
    expect(exported.body.user).toBeTruthy();
    expect(Array.isArray(exported.body.cases)).toBe(true);
  });

  it('ärendenumret följer med hela vägen', () => {
    expect(caseNumber).toMatch(/^\d{4}-\d{5}$/);
  });
});
