import type pg from 'pg';
import {
  generateInvitationCode,
  generateTotpSecret,
  hashPassword,
  hashToken,
} from '../core/crypto.js';
import { createAdminPool } from './pool.js';

/**
 * Demodata för två helt åtskilda fastighetsbolag.
 *
 * Två organisationer krävs för att kunna visa och testa att ingen information
 * läcker mellan bolag. Data är påhittad men strukturerad som verklig förvaltning.
 */

export const DEMO_PASSWORD = 'Demolosenord123!';

interface SeedResult {
  orgs: { id: string; slug: string }[];
}

const now = new Date();
const daysFromNow = (days: number) => new Date(now.getTime() + days * 86_400_000);
const hoursFromNow = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const APP_ZONE = 'Europe/Stockholm';

/** Zonens avvikelse från UTC i minuter vid en viss tidpunkt. */
function zoneOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_ZONE,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const part = (type: string) => Number(parts.find((p) => p.type === type)!.value);
  const asIfUtc = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour') === 24 ? 0 : part('hour'),
    part('minute'),
    part('second'),
  );
  return (asIfUtc - at.getTime()) / 60_000;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Antal dagar fram till nästa angivna veckodag i svensk tid (0 = söndag).
 * Används för att demodata ska stämma med sin egen text: står det att vattnet
 * stängs av på torsdag ska tidpunkten också vara en torsdag.
 */
function daysUntilWeekday(weekday: number, minDays = 1): number {
  for (let offset = minDays; offset < minDays + 7; offset += 1) {
    const day = atLocalTime(offset, 12);
    const name = new Intl.DateTimeFormat('en-US', { timeZone: APP_ZONE, weekday: 'short' }).format(day);
    if (WEEKDAY_NAMES.indexOf(name) === weekday) return offset;
  }
  return minDays;
}

/**
 * Tidpunkten för ett klockslag i svensk tid, oavsett vilken tidszon servern
 * kör i. Utan detta hamnar demodata fel så snart seeden körs i UTC – en
 * tvättid klockan 19 skulle visas som 21 i appen, alltså efter stängning.
 */
function atLocalTime(daysAhead: number, hour: number, minute = 0): Date {
  const day = isoDate(daysFromNow(daysAhead));
  const naive = new Date(
    `${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`,
  );
  // Två steg räcker för att landa rätt även dygnet då sommartiden växlar.
  let instant = new Date(naive.getTime() - zoneOffsetMinutes(naive) * 60_000);
  instant = new Date(naive.getTime() - zoneOffsetMinutes(instant) * 60_000);
  return instant;
}

async function insert<T extends Record<string, unknown>>(
  client: pg.PoolClient,
  table: string,
  values: T,
): Promise<string> {
  const keys = Object.keys(values);
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const result = await client.query<{ id: string }>(
    `insert into ${table} (${keys.map((k) => `"${k}"`).join(', ')}) values (${placeholders}) returning id`,
    keys.map((k) => values[k]),
  );
  return result.rows[0]!.id;
}

interface OrgBlueprint {
  slug: string;
  legalName: string;
  displayName: string;
  orgNumber: string;
  primaryColor: string;
  accentColor: string;
  supportEmail: string;
  supportPhone: string;
  emergencyPhone: string;
  disturbancePhone: string;
  websiteUrl: string;
  city: string;
  areas: {
    name: string;
    code: string;
    properties: {
      name: string;
      designation: string;
      street: string;
      postalCode: string;
      latitude: number;
      longitude: number;
      buildings: { name: string; entrances: { name: string; street: string; units: number }[] }[];
    }[];
  }[];
  staff: { first: string; last: string; email: string; roles: string[] }[];
  residents: { first: string; last: string; email: string; unitIndex: number; co?: { first: string; last: string; email: string } }[];
  contractor: { name: string; orgNumber: string; email: string; userFirst: string; userLast: string; userEmail: string; trades: string[] };
}

const BLUEPRINTS: OrgBlueprint[] = [
  {
    slug: 'botkyrkabyggen',
    legalName: 'AB Botkyrkabyggen',
    displayName: 'Botkyrkabyggen',
    orgNumber: '556064-6191',
    primaryColor: '#1F3A34',
    accentColor: '#C6704F',
    supportEmail: 'kundservice@demo-botkyrkabyggen.se',
    supportPhone: '08-530 000 00',
    emergencyPhone: '08-530 000 99',
    disturbancePhone: '08-530 000 88',
    websiteUrl: 'https://www.botkyrkabyggen.se',
    city: 'Tumba',
    areas: [
      {
        name: 'Alby',
        code: 'ALB',
        properties: [
          {
            name: 'Albyberget 3',
            designation: 'Alby 3:12',
            street: 'Albyvägen 12',
            postalCode: '145 61',
            latitude: 59.2385,
            longitude: 17.8562,
            buildings: [
              {
                name: 'Hus A',
                entrances: [
                  { name: 'A', street: 'Albyvägen 12A', units: 8 },
                  { name: 'B', street: 'Albyvägen 12B', units: 8 },
                ],
              },
              { name: 'Hus B', entrances: [{ name: 'C', street: 'Albyvägen 14C', units: 6 }] },
            ],
          },
        ],
      },
      {
        name: 'Fittja',
        code: 'FIT',
        properties: [
          {
            name: 'Fittja Torg 2',
            designation: 'Fittja 2:4',
            street: 'Krögarvägen 2',
            postalCode: '145 63',
            latitude: 59.2456,
            longitude: 17.8593,
            buildings: [{ name: 'Hus 1', entrances: [{ name: '2', street: 'Krögarvägen 2', units: 10 }] }],
          },
        ],
      },
    ],
    staff: [
      { first: 'Anna', last: 'Lindqvist', email: 'anna.lindqvist@demo-botkyrkabyggen.se', roles: ['admin'] },
      { first: 'Peter', last: 'Ohlsson', email: 'peter.ohlsson@demo-botkyrkabyggen.se', roles: ['property_manager'] },
      { first: 'Sara', last: 'Nyman', email: 'sara.nyman@demo-botkyrkabyggen.se', roles: ['customer_service'] },
      { first: 'Kemal', last: 'Yildiz', email: 'kemal.yildiz@demo-botkyrkabyggen.se', roles: ['caretaker'] },
      { first: 'Elin', last: 'Berg', email: 'elin.berg@demo-botkyrkabyggen.se', roles: ['area_manager'] },
    ],
    residents: [
      {
        first: 'Robin',
        last: 'Ek',
        email: 'robin.ek@example.com',
        unitIndex: 0,
        co: { first: 'Maja', last: 'Ek', email: 'maja.ek@example.com' },
      },
      { first: 'Fatima', last: 'Haddad', email: 'fatima.haddad@example.com', unitIndex: 1 },
      { first: 'Johan', last: 'Persson', email: 'johan.persson@example.com', unitIndex: 2 },
      { first: 'Amina', last: 'Osman', email: 'amina.osman@example.com', unitIndex: 9 },
    ],
    contractor: {
      name: 'Ström & Rör AB',
      orgNumber: '556711-2233',
      email: 'jour@demo-stromochror.se',
      userFirst: 'Tobias',
      userLast: 'Ström',
      userEmail: 'tobias.strom@demo-stromochror.se',
      trades: ['vvs', 'el'],
    },
  },
  {
    slug: 'norrstaden',
    legalName: 'Norrstaden Fastigheter AB',
    displayName: 'Norrstaden',
    orgNumber: '556900-1122',
    primaryColor: '#243B53',
    accentColor: '#B08968',
    supportEmail: 'kundservice@demo-norrstaden.se',
    supportPhone: '060-12 34 56',
    emergencyPhone: '060-12 34 99',
    disturbancePhone: '060-12 34 88',
    websiteUrl: 'https://www.example.com/norrstaden',
    city: 'Sundsvall',
    areas: [
      {
        name: 'Haga',
        code: 'HAG',
        properties: [
          {
            name: 'Hagagatan 8',
            designation: 'Haga 1:9',
            street: 'Hagagatan 8',
            postalCode: '852 30',
            latitude: 62.3908,
            longitude: 17.3069,
            buildings: [{ name: 'Hus A', entrances: [{ name: 'A', street: 'Hagagatan 8A', units: 6 }] }],
          },
        ],
      },
    ],
    staff: [
      { first: 'Marcus', last: 'Sund', email: 'marcus.sund@demo-norrstaden.se', roles: ['admin'] },
      { first: 'Lena', last: 'Öberg', email: 'lena.oberg@demo-norrstaden.se', roles: ['property_manager'] },
    ],
    residents: [
      { first: 'Karin', last: 'Holm', email: 'karin.holm@example.com', unitIndex: 0 },
      { first: 'Ali', last: 'Rahimi', email: 'ali.rahimi@example.com', unitIndex: 1 },
    ],
    contractor: {
      name: 'Norrlands Fastighetsservice AB',
      orgNumber: '556822-4455',
      email: 'order@demo-norrlandsservice.se',
      userFirst: 'Ingrid',
      userLast: 'Norell',
      userEmail: 'ingrid.norell@demo-norrlandsservice.se',
      trades: ['bygg', 'vitvaror'],
    },
  },
];

async function seedOrg(client: pg.PoolClient, bp: OrgBlueprint, passwordHash: string) {
  const orgId = await insert(client, 'organisations', {
    slug: bp.slug,
    legal_name: bp.legalName,
    display_name: bp.displayName,
    org_number: bp.orgNumber,
    primary_color: bp.primaryColor,
    accent_color: bp.accentColor,
    support_email: bp.supportEmail,
    support_phone: bp.supportPhone,
    emergency_phone: bp.emergencyPhone,
    disturbance_phone: bp.disturbancePhone,
    website_url: bp.websiteUrl,
    default_locale: 'sv',
    terminology: JSON.stringify({ case: 'Felanmälan', caretaker: 'Bovärd', area: 'Område' }),
  });
  await client.query('insert into case_counters (org_id, next_number) values ($1, 1)', [orgId]);

  /* -------------------------------------------------------- struktur --- */
  const areaIds: string[] = [];
  const propertyIds: string[] = [];
  const buildingIds: string[] = [];
  const entranceIds: string[] = [];
  const units: { id: string; objectNumber: string; entranceId: string; buildingId: string; propertyId: string; areaId: string }[] = [];
  let objectSeq = 1;

  for (const area of bp.areas) {
    const areaId = await insert(client, 'areas', {
      org_id: orgId,
      name: area.name,
      code: area.code,
      description: `Förvaltningsområde ${area.name}.`,
    });
    areaIds.push(areaId);

    for (const property of area.properties) {
      const propertyId = await insert(client, 'properties', {
        org_id: orgId,
        area_id: areaId,
        name: property.name,
        designation: property.designation,
        street: property.street,
        postal_code: property.postalCode,
        city: bp.city,
        latitude: property.latitude,
        longitude: property.longitude,
      });
      propertyIds.push(propertyId);

      for (const building of property.buildings) {
        const buildingId = await insert(client, 'buildings', {
          org_id: orgId,
          property_id: propertyId,
          name: building.name,
          street: property.street,
          construction_year: 1972,
          floors: 5,
          has_elevator: true,
        });
        buildingIds.push(buildingId);

        for (const entrance of building.entrances) {
          const entranceId = await insert(client, 'entrances', {
            org_id: orgId,
            building_id: buildingId,
            name: entrance.name,
            street: entrance.street,
          });
          entranceIds.push(entranceId);

          for (let i = 0; i < entrance.units; i += 1) {
            const floor = Math.floor(i / 2) + 1;
            const objectNumber = `${area.code}-${String(objectSeq).padStart(4, '0')}`;
            objectSeq += 1;
            const unitId = await insert(client, 'units', {
              org_id: orgId,
              entrance_id: entranceId,
              object_number: objectNumber,
              label: `${floor}${String(i % 2 === 0 ? '01' : '02')}`,
              floor,
              rooms: (i % 3) + 1,
              area_sqm: 42 + (i % 4) * 13,
              kind: 'apartment',
            });
            units.push({ id: unitId, objectNumber, entranceId, buildingId, propertyId, areaId });

            for (const feature of [
              { category: 'vitvaror', label: 'Kyl och frys', value: 'Electrolux, installerad 2019' },
              { category: 'vitvaror', label: 'Spis och ugn', value: 'Cylinda, installerad 2019' },
              { category: 'utrustning', label: 'Balkong', value: i % 2 === 0 ? 'Ja' : 'Nej' },
              { category: 'utrustning', label: 'Bredband', value: 'Fiber, öppet stadsnät' },
            ]) {
              await insert(client, 'unit_features', { org_id: orgId, unit_id: unitId, ...feature });
            }
          }
        }
      }
    }
  }

  /* ------------------------------------------------------ kontaktinfo --- */
  await insert(client, 'property_contacts', {
    org_id: orgId,
    scope: 'organisation',
    scope_id: null,
    role_label: 'Kundservice',
    name: `${bp.displayName} kundservice`,
    phone: bp.supportPhone,
    email: bp.supportEmail,
    hours: 'Vardagar 08.00–16.00',
    sort_order: 1,
  });
  await insert(client, 'property_contacts', {
    org_id: orgId,
    scope: 'organisation',
    scope_id: null,
    role_label: 'Fastighetsjour',
    name: 'Jour utanför kontorstid',
    phone: bp.emergencyPhone,
    hours: 'Vardagar 16.00–08.00 samt helger',
    sort_order: 2,
  });
  await insert(client, 'property_contacts', {
    org_id: orgId,
    scope: 'organisation',
    scope_id: null,
    role_label: 'Störningsjour',
    name: 'Störningsjour',
    phone: bp.disturbancePhone,
    hours: 'Alla dagar 18.00–06.00',
    sort_order: 3,
  });

  for (const areaId of areaIds) {
    for (const info of [
      { kind: 'recycling', title: 'Miljörum', body: 'Miljörummet ligger på gården och är öppet dygnet runt med tagg. Sortera i kärlen som är märkta för respektive fraktion. Grovsopor lämnas på återvinningscentralen.' },
      { kind: 'laundry', title: 'Tvättstugor', body: 'Tvättstugan bokas i appen. Städa efter dig och lämna maskinerna torra. Torkrummet är ledigt en timme efter passet.' },
      { kind: 'parking', title: 'Parkering', body: 'Parkeringsplats hyrs separat och kösätts via uthyrningen. Besöksparkering finns på gatan enligt skyltning.' },
      { kind: 'playground', title: 'Lekplats', body: 'Lekplatsen besiktigas två gånger per år. Anmäl skador direkt via felanmälan så åtgärdas de skyndsamt.' },
      { kind: 'safety', title: 'Trygghet i området', body: 'Områdesvärdar finns på plats kvällstid. Vid pågående brott, ring alltid 112.' },
    ]) {
      await insert(client, 'area_infos', { org_id: orgId, scope: 'area', scope_id: areaId, ...info, sort_order: 0 });
    }
  }

  for (const article of [
    { slug: 'skotselrad', category: 'my_home', title: 'Skötselråd för din bostad', body_html: '<p>Rengör köksfläktens filter varje månad och spola golvbrunnen ren från hår. Vädra kort och effektivt i stället för att ha fönstret på glänt hela dagen.</p><p>Kontrollera brandvarnaren en gång i kvartalet genom att trycka på testknappen.</p>' },
    { slug: 'ansvarsfordelning', category: 'my_home', title: 'Vem ansvarar för vad', body_html: '<p>Hyresvärden ansvarar för fast utrustning, vitvaror och underhåll av ytskikt. Du som hyresgäst ansvarar för lampor, säkringar, batterier i brandvarnare samt för skador som du eller dina gäster orsakar.</p>' },
    { slug: 'brandinformation', category: 'safety', title: 'Om det börjar brinna', body_html: '<p>Brinner det i din lägenhet: ta dig ut, stäng dörren och ring 112. Brinner det utanför lägenheten: stanna kvar om du inte är i fara. Använd aldrig hissen.</p><p>Trapphuset är utrymningsväg och får inte blockeras av barnvagnar eller möbler.</p>' },
    { slug: 'hjalp-felanmalan', category: 'help', title: 'Så gör du en bra felanmälan', body_html: '<p>Beskriv vad som hänt, var i bostaden felet finns och sedan när. Lägg gärna till en bild. Godkänner du att bovärden använder huvudnyckel kan felet ofta åtgärdas utan att du behöver vara hemma.</p>' },
  ]) {
    await insert(client, 'knowledge_articles', { org_id: orgId, locale: 'sv', published: true, ...article });
  }

  /* -------------------------------------------------------- personal --- */
  const staffIds: Record<string, string> = {};
  for (const person of bp.staff) {
    const userId = await insert(client, 'users', {
      org_id: orgId,
      email: person.email,
      password_hash: passwordHash,
      first_name: person.first,
      last_name: person.last,
      phone: '070-000 00 00',
      status: 'active',
      email_verified_at: now,
      // Personalkonton har tvåfaktor aktiverad från start (krav C.2.6, C.2.11).
      mfa_secret: generateTotpSecret(),
      mfa_enabled_at: now,
      password_changed_at: now,
    });
    staffIds[person.email] = userId;
    for (const role of person.roles) {
      await client.query('insert into user_roles (org_id, user_id, role) values ($1,$2,$3)', [orgId, userId, role]);
    }
  }

  // Behörighetsavgränsning. Administratörer och kundservice arbetar mot hela
  // beståndet; förvaltare och fastighetsskötare får de områden de ansvarar för.
  for (const person of bp.staff) {
    const scopedRoles = ['property_manager', 'caretaker', 'technician', 'letting_agent', 'area_manager'];
    if (!person.roles.some((role) => scopedRoles.includes(role))) continue;
    const assigned = person.roles.includes('area_manager') ? areaIds : areaIds.slice(0, 1);
    for (const areaId of assigned) {
      await insert(client, 'user_scopes', {
        org_id: orgId,
        user_id: staffIds[person.email],
        scope: 'area',
        scope_id: areaId,
      });
    }
  }

  const teamIds: Record<string, string> = {};
  for (const team of [
    { name: 'Bovärdar', description: 'Fastighetsskötsel och akuta åtgärder i beståndet.' },
    { name: 'VVS och el', description: 'Installationer, vatten, avlopp och el.' },
    { name: 'Kundservice', description: 'Första linjen för hyresgästernas frågor.' },
    { name: 'Störningsteam', description: 'Störningar och trygghetsärenden. Begränsad behörighet.' },
  ]) {
    teamIds[team.name] = await insert(client, 'teams', { org_id: orgId, name: team.name, description: team.description });
  }

  const caretakerEmail = bp.staff.find((s) => s.roles.includes('caretaker'))?.email;
  const managerEmail = bp.staff.find((s) => s.roles.includes('property_manager'))?.email;
  if (caretakerEmail) {
    await client.query('insert into team_members (org_id, team_id, user_id) values ($1,$2,$3)', [orgId, teamIds['Bovärdar'], staffIds[caretakerEmail]]);
  }
  if (managerEmail) {
    await client.query('insert into team_members (org_id, team_id, user_id) values ($1,$2,$3)', [orgId, teamIds['Störningsteam'], staffIds[managerEmail]]);
  }

  for (const rule of [
    { category_key: 'water_drainage', team: 'VVS och el', sort_order: 10 },
    { category_key: 'electricity', team: 'VVS och el', sort_order: 20 },
    { category_key: 'heating', team: 'VVS och el', sort_order: 30 },
    { category_key: 'disturbance', team: 'Störningsteam', sort_order: 5 },
    { category_key: null, team: 'Bovärdar', sort_order: 100 },
  ]) {
    await insert(client, 'routing_rules', {
      org_id: orgId,
      category_key: rule.category_key,
      team_id: teamIds[rule.team],
      sort_order: rule.sort_order,
      active: true,
    });
  }

  /* ------------------------------------------------------ entreprenör --- */
  const contractorOrgId = await insert(client, 'contractor_orgs', {
    org_id: orgId,
    name: bp.contractor.name,
    org_number: bp.contractor.orgNumber,
    contact_email: bp.contractor.email,
    contact_phone: '08-111 22 33',
    trades: bp.contractor.trades,
  });
  const contractorUserId = await insert(client, 'users', {
    org_id: orgId,
    email: bp.contractor.userEmail,
    password_hash: passwordHash,
    first_name: bp.contractor.userFirst,
    last_name: bp.contractor.userLast,
    status: 'active',
    email_verified_at: now,
    contractor_org_id: contractorOrgId,
    password_changed_at: now,
  });
  await client.query('insert into user_roles (org_id, user_id, role) values ($1,$2,$3)', [orgId, contractorUserId, 'contractor']);

  /* --------------------------------------------------- hyresgäster --- */
  const residentIds: Record<string, string> = {};
  const tenancyIds: string[] = [];
  for (const resident of bp.residents) {
    const unit = units[resident.unitIndex]!;
    const tenancyId = await insert(client, 'tenancies', {
      org_id: orgId,
      unit_id: unit.id,
      external_ref: `HK-${unit.objectNumber}`,
      starts_at: isoDate(daysFromNow(-420)),
      earliest_move_out: isoDate(daysFromNow(92)),
      monthly_rent_ore: 895_000 + resident.unitIndex * 12_000,
      status: 'active',
    });
    tenancyIds.push(tenancyId);

    const userId = await insert(client, 'users', {
      org_id: orgId,
      email: resident.email,
      password_hash: passwordHash,
      first_name: resident.first,
      last_name: resident.last,
      phone: '070-123 45 67',
      status: 'active',
      email_verified_at: now,
      external_ref: `KUND-${unit.objectNumber}`,
      password_changed_at: now,
    });
    residentIds[resident.email] = userId;
    await client.query('insert into user_roles (org_id, user_id, role) values ($1,$2,$3)', [orgId, userId, 'tenant']);
    await insert(client, 'tenancy_residents', {
      org_id: orgId,
      tenancy_id: tenancyId,
      user_id: userId,
      role: 'tenant',
      is_primary: true,
      moved_in_at: isoDate(daysFromNow(-420)),
    });

    if (resident.co) {
      const coId = await insert(client, 'users', {
        org_id: orgId,
        email: resident.co.email,
        password_hash: passwordHash,
        first_name: resident.co.first,
        last_name: resident.co.last,
        status: 'active',
        email_verified_at: now,
        password_changed_at: now,
      });
      residentIds[resident.co.email] = coId;
      await client.query('insert into user_roles (org_id, user_id, role) values ($1,$2,$3)', [orgId, coId, 'co_resident']);
      await insert(client, 'tenancy_residents', {
        org_id: orgId,
        tenancy_id: tenancyId,
        user_id: coId,
        role: 'co_resident',
        is_primary: false,
        moved_in_at: isoDate(daysFromNow(-300)),
      });
    }

    // Avier för de tre senaste månaderna plus kommande.
    for (let m = -2; m <= 1; m += 1) {
      const periodStart = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + m + 1, 0);
      const due = new Date(now.getFullYear(), now.getMonth() + m, 28);
      const paid = m < 0;
      await insert(client, 'invoices', {
        org_id: orgId,
        tenancy_id: tenancyId,
        invoice_number: `${new Date(periodStart).getFullYear()}${String(periodStart.getMonth() + 1).padStart(2, '0')}-${unit.objectNumber}`,
        ocr: `${Date.now().toString().slice(-8)}${Math.abs(m)}${resident.unitIndex}`.slice(0, 12),
        bankgiro: '5051-6905',
        period_start: isoDate(periodStart),
        period_end: isoDate(periodEnd),
        due_date: isoDate(due),
        amount_ore: 895_000 + resident.unitIndex * 12_000,
        status: paid ? 'paid' : 'open',
        paid_at: paid ? due : null,
        external_ref: `EKO-${unit.objectNumber}-${m}`,
        synced_at: now,
      });
    }

    // En inbjudningskod per avtal, för att kunna koppla nya konton till rätt objekt.
    const code = generateInvitationCode();
    await insert(client, 'invitations', {
      org_id: orgId,
      code_hash: hashToken(code),
      tenancy_id: tenancyId,
      role: 'co_resident',
      expires_at: daysFromNow(180),
    });
  }

  /* ------------------------------------------------------- resurser --- */
  const resourceIds: string[] = [];
  for (const [index, property] of propertyIds.entries()) {
    resourceIds.push(
      await insert(client, 'resources', {
        org_id: orgId,
        kind: 'laundry',
        name: `Tvättstuga ${index + 1}`,
        description: 'Tre maskiner, torktumlare och torkrum. Passen är tre timmar.',
        scope: 'property',
        scope_id: property,
        slot_minutes: 180,
        opens_at: '07:00',
        closes_at: '22:00',
        max_active_per_tenancy: 2,
        max_days_ahead: 21,
        cancellation_hours: 2,
        waitlist_enabled: true,
      }),
    );
    resourceIds.push(
      await insert(client, 'resources', {
        org_id: orgId,
        kind: 'common_room',
        name: 'Gemensamhetslokal',
        description: 'Lokal för upp till 25 personer. Städning ingår inte.',
        scope: 'property',
        scope_id: property,
        slot_minutes: 360,
        opens_at: '09:00',
        closes_at: '23:00',
        max_active_per_tenancy: 1,
        max_days_ahead: 90,
        cancellation_hours: 48,
        price_ore: 30_000,
        deposit_ore: 100_000,
        requires_approval: true,
      }),
    );
  }
  resourceIds.push(
    await insert(client, 'resources', {
      org_id: orgId,
      kind: 'caretaker_visit',
      name: 'Besök av bovärd',
      description: 'Tider för planerade besök i bostaden.',
      scope: 'organisation',
      scope_id: null,
      slot_minutes: 120,
      opens_at: '08:00',
      closes_at: '16:00',
      max_active_per_tenancy: 4,
      max_days_ahead: 30,
      cancellation_hours: 24,
    }),
  );

  /* ---------------------------------------------------- passagepunkter --- */
  for (const buildingId of buildingIds) {
    await insert(client, 'access_points', {
      org_id: orgId,
      kind: 'entrance_door',
      name: 'Port',
      scope: 'building',
      scope_id: buildingId,
    });
    await insert(client, 'access_points', {
      org_id: orgId,
      kind: 'laundry',
      name: 'Tvättstuga',
      scope: 'building',
      scope_id: buildingId,
    });
  }

  /* ------------------------------------------------------ integrationer --- */
  const integrations: { kind: string; name: string; status: string; notes: string }[] = [
    { kind: 'property_system', name: 'Vitec Hyra', status: 'requires_configuration', notes: 'Kräver API-nyckel och avtal om dataöverföring innan anslutning.' },
    { kind: 'access_control', name: 'Aptus', status: 'requires_configuration', notes: 'Kräver anslutningsavtal och teknisk konfiguration hos leverantören.' },
    { kind: 'booking', name: 'Aptus bokning', status: 'requires_configuration', notes: 'Aktiveras tillsammans med passersystemet.' },
    { kind: 'bankid', name: 'BankID', status: 'planned', notes: 'Kräver avtal med en BankID-leverantör samt produktionscertifikat.' },
    { kind: 'sso', name: 'Microsoft Entra ID', status: 'requires_configuration', notes: 'OpenID Connect. Kräver appregistrering i kundens katalog.' },
    { kind: 'email', name: 'E-postutskick', status: 'requires_configuration', notes: 'SMTP-uppgifter saknas. Utgående e-post köas tills tjänsten konfigurerats.' },
    { kind: 'sms', name: 'SMS-utskick', status: 'planned', notes: 'Kräver avtal med SMS-operatör.' },
    { kind: 'push', name: 'Pushnotiser', status: 'requires_configuration', notes: 'Kräver nycklar för APNs och FCM.' },
    { kind: 'payments', name: 'Betallösning', status: 'planned', notes: 'Ingen betalning sker i appen förrän avtal och integration finns.' },
    { kind: 'e_signing', name: 'Digital signering', status: 'planned', notes: 'Kräver avtal med signeringsleverantör.' },
    { kind: 'finance', name: 'Ekonomisystem', status: 'requires_configuration', notes: 'Avier importeras i dag som fil. Direktintegration kräver konfiguration.' },
    { kind: 'maps', name: 'Kartunderlag', status: 'connected', notes: 'Öppna kartdata används för ärendekartan. Ingen nyckel krävs.' },
    { kind: 'calendar', name: 'Extern kalender', status: 'connected', notes: 'Bokningar kan laddas ned som ICS-fil utan extern tjänst.' },
    { kind: 'digital_locks', name: 'Digitala lås', status: 'planned', notes: 'Digitala nycklar visas inte förrän en verklig integration finns.' },
    { kind: 'contractor_system', name: 'Entreprenörssystem', status: 'planned', notes: 'Arbetsorder hanteras i entreprenörsportalen tills integration finns.' },
    { kind: 'metering', name: 'Mätvärden el och vatten', status: 'planned', notes: 'Förbrukning visas först när mätvärden kan hämtas.' },
    { kind: 'customer_service', name: 'Kundserviceplattform', status: 'disconnected', notes: 'Tidigare kopplad. Anslutningen är avstängd.' },
    { kind: 'identity', name: 'Identitetsverifiering', status: 'planned', notes: 'Används vid utökad verifiering av nya konton.' },
    { kind: 'rent_invoicing', name: 'Hyresavisering', status: 'sandbox', notes: 'Testmiljö mot aviseringsleverantören. Inte i produktion.' },
    { kind: 'file_scanning', name: 'Säkerhetsgranskning av bilagor', status: 'requires_configuration', notes: 'Filtyp och innehåll kontrolleras alltid. Extern skanning aktiveras med FILE_SCAN_URL.' },
  ];
  for (const integration of integrations) {
    await insert(client, 'integrations', { org_id: orgId, ...integration });
  }

  for (const policy of [
    { entity: 'case', retain_days: 3650, action: 'anonymise', description: 'Ärenden anonymiseras tio år efter avslut.' },
    { entity: 'audit_log', retain_days: 730, action: 'delete', description: 'Säkerhetslogg sparas två år.' },
    { entity: 'notification', retain_days: 365, action: 'delete', description: 'Notiser rensas efter ett år.' },
    { entity: 'session', retain_days: 90, action: 'delete', description: 'Avslutade sessioner rensas efter 90 dagar.' },
    { entity: 'login_attempt', retain_days: 180, action: 'delete', description: 'Inloggningsförsök sparas ett halvår.' },
  ]) {
    await insert(client, 'retention_policies', { org_id: orgId, ...policy });
  }

  return { orgId, areaIds, propertyIds, buildingIds, units, staffIds, residentIds, tenancyIds, teamIds, resourceIds, contractorOrgId, contractorUserId };
}

export async function seed(): Promise<SeedResult> {
  const pool = createAdminPool();
  const client = await pool.connect();
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const orgs: { id: string; slug: string }[] = [];
  try {
    await client.query('begin');
    const existing = await client.query('select count(*)::int as count from organisations');
    if ((existing.rows[0]?.count ?? 0) > 0) {
      await client.query('rollback');
      return { orgs: [] };
    }

    for (const blueprint of BLUEPRINTS) {
      const ctx = await seedOrg(client, blueprint, passwordHash);
      orgs.push({ id: ctx.orgId, slug: blueprint.slug });
      await seedActivity(client, ctx, blueprint);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
  return { orgs };
}

type OrgContext = Awaited<ReturnType<typeof seedOrg>>;

/** Ärenden, driftinformation, bokningar och enkäter så att vyerna har innehåll. */
async function seedActivity(client: pg.PoolClient, ctx: OrgContext, bp: OrgBlueprint): Promise<void> {
  const { orgId } = ctx;
  const residentEmails = Object.keys(ctx.residentIds);
  const firstResident = ctx.residentIds[residentEmails[0]!]!;
  const caretakerEmail = bp.staff.find((s) => s.roles.includes('caretaker'))?.email ?? bp.staff[0]!.email;
  const caretakerId = ctx.staffIds[caretakerEmail]!;
  const serviceEmail = bp.staff.find((s) => s.roles.includes('customer_service'))?.email ?? bp.staff[0]!.email;
  const serviceId = ctx.staffIds[serviceEmail]!;

  const nextCaseNumber = async (): Promise<string> => {
    const result = await client.query<{ next_number: number }>(
      'update case_counters set next_number = next_number + 1 where org_id = $1 returning next_number - 1 as next_number',
      [orgId],
    );
    const year = new Date().getFullYear();
    return `${year}-${String(result.rows[0]!.next_number).padStart(5, '0')}`;
  };

  const tenancyId = ctx.tenancyIds[0]!;
  const tenancyRow = await client.query<{ unit_id: string }>('select unit_id from tenancies where id = $1', [tenancyId]);
  const unitId = tenancyRow.rows[0]!.unit_id;
  const unit = ctx.units.find((u) => u.id === unitId)!;

  /* --------------------------------------------- ärende under arbete --- */
  const caseId = await insert(client, 'cases', {
    org_id: orgId,
    case_number: await nextCaseNumber(),
    kind: 'fault_report',
    status: 'visit_booked',
    priority: 'high',
    location_kind: 'residence',
    category_key: 'water_drainage',
    subcategory_key: 'leak',
    space: 'bathroom',
    title: 'Vattenläcka under handfatet i badrummet',
    description:
      'Det droppar från röret under handfatet. Jag har lagt en hink under och stängt av kranen. Golvet har blivit blött vid listen.',
    tenancy_id: tenancyId,
    unit_id: unit.id,
    building_id: unit.buildingId,
    property_id: unit.propertyId,
    area_id: unit.areaId,
    reporter_user_id: firstResident,
    assignee_id: caretakerId,
    team_id: ctx.teamIds['VVS och el'],
    allow_master_key: true,
    triage_answers: JSON.stringify({ ongoing: 'no', can_shut_off: 'yes', damage_risk: 'no' }),
    sla_respond_at: hoursFromNow(-40),
    sla_resolve_at: hoursFromNow(8),
    first_response_at: hoursFromNow(-42),
    contact_phone: '070-123 45 67',
    created_at: hoursFromNow(-46),
    updated_at: hoursFromNow(-20),
  });

  const events = [
    { at: hoursFromNow(-46), kind: 'created', to_status: 'received', actor: firstResident, payload: { source: 'app' } },
    { at: hoursFromNow(-45), kind: 'status_changed', from_status: 'received', to_status: 'under_review', actor: serviceId, payload: {} },
    { at: hoursFromNow(-42), kind: 'assigned', from_status: 'under_review', to_status: 'assigned', actor: serviceId, payload: { assignee: 'Bovärd' } },
    { at: hoursFromNow(-20), kind: 'visit_booked', from_status: 'assigned', to_status: 'visit_booked', actor: caretakerId, payload: {} },
  ];
  for (const event of events) {
    await insert(client, 'case_events', {
      org_id: orgId,
      case_id: caseId,
      at: event.at,
      actor_user_id: event.actor,
      kind: event.kind,
      from_status: event.from_status ?? null,
      to_status: event.to_status,
      payload: JSON.stringify(event.payload),
      visible_to_resident: true,
    });
  }
  await insert(client, 'case_comments', {
    org_id: orgId,
    case_id: caseId,
    author_user_id: serviceId,
    body: 'Tack för din anmälan. Vi har bokat in ett besök. Behöver du boka om tiden gör du det direkt i ärendet.',
    internal: false,
  });
  await insert(client, 'case_comments', {
    org_id: orgId,
    case_id: caseId,
    author_user_id: caretakerId,
    body: 'Tar med ny vattenlås-sats. Kontrollera även tätskiktet vid listen.',
    internal: true,
  });

  const visitResourceId = ctx.resourceIds[ctx.resourceIds.length - 1]!;
  // Besöket ligger 09.00–11.00 svensk tid nästa dag, inom resursens öppettider.
  const visitStart = atLocalTime(1, 9);
  const visitEnd = new Date(visitStart.getTime() + 2 * 3_600_000);
  await insert(client, 'bookings', {
    org_id: orgId,
    resource_id: visitResourceId,
    tenancy_id: tenancyId,
    user_id: firstResident,
    case_id: caseId,
    slot: `[${visitStart.toISOString()},${visitEnd.toISOString()})`,
    status: 'confirmed',
    note: 'Besök för vattenläcka.',
    created_by: caretakerId,
  });

  /* ------------------------------------------------- avslutat ärende --- */
  const closedCaseId = await insert(client, 'cases', {
    org_id: orgId,
    case_number: await nextCaseNumber(),
    kind: 'fault_report',
    status: 'closed',
    priority: 'normal',
    location_kind: 'common_area',
    category_key: 'common_areas',
    subcategory_key: 'lighting',
    space: 'stairwell',
    title: 'Trasig lampa i trapphuset',
    description: 'Lampan på plan tre blinkar och slocknar.',
    building_id: unit.buildingId,
    property_id: unit.propertyId,
    area_id: unit.areaId,
    reporter_user_id: firstResident,
    assignee_id: caretakerId,
    team_id: ctx.teamIds['Bovärdar'],
    sla_respond_at: hoursFromNow(-200),
    sla_resolve_at: hoursFromNow(-100),
    first_response_at: hoursFromNow(-210),
    resolved_at: hoursFromNow(-120),
    closed_at: hoursFromNow(-118),
    cost_actual_ore: 42_000,
    created_at: hoursFromNow(-220),
    updated_at: hoursFromNow(-118),
  });
  for (const event of [
    { at: hoursFromNow(-220), kind: 'created', to_status: 'received' },
    { at: hoursFromNow(-210), kind: 'assigned', from_status: 'received', to_status: 'assigned' },
    { at: hoursFromNow(-150), kind: 'status_changed', from_status: 'assigned', to_status: 'in_progress' },
    { at: hoursFromNow(-120), kind: 'status_changed', from_status: 'in_progress', to_status: 'resolved' },
    { at: hoursFromNow(-118), kind: 'status_changed', from_status: 'resolved', to_status: 'closed' },
  ]) {
    await insert(client, 'case_events', {
      org_id: orgId,
      case_id: closedCaseId,
      at: event.at,
      actor_user_id: caretakerId,
      kind: event.kind,
      from_status: event.from_status ?? null,
      to_status: event.to_status,
      visible_to_resident: true,
    });
  }
  await insert(client, 'case_feedback', {
    org_id: orgId,
    case_id: closedCaseId,
    user_id: firstResident,
    rating: 5,
    comment: 'Snabbt åtgärdat, tack.',
    resolved: true,
  });

  /* --------------------------------- ärende utlagt på entreprenör --- */
  // Ett uppdrag ligger som erbjudet, så att entreprenörsportalen har innehåll
  // direkt efter seed och kontaktspärren går att se före accept.
  const contractorCaseId = await insert(client, 'cases', {
    org_id: orgId,
    case_number: await nextCaseNumber(),
    kind: 'fault_report',
    status: 'assigned',
    priority: 'normal',
    location_kind: 'residence',
    category_key: 'heating',
    subcategory_key: 'no_heat',
    space: 'living_room',
    title: 'Elementet i vardagsrummet blir inte varmt',
    description:
      'Elementet under fönstret är kallt längst ned även när termostaten står på max. Det klickar till ibland men blir aldrig varmt.',
    tenancy_id: tenancyId,
    unit_id: unit.id,
    building_id: unit.buildingId,
    property_id: unit.propertyId,
    area_id: unit.areaId,
    reporter_user_id: firstResident,
    team_id: ctx.teamIds['VVS och el'],
    contractor_org_id: ctx.contractorOrgId,
    allow_master_key: true,
    contact_phone: '070-123 45 67',
    triage_answers: JSON.stringify({ temperature: '18_20', radiators: 'no' }),
    sla_respond_at: hoursFromNow(-2),
    sla_resolve_at: hoursFromNow(70),
    first_response_at: hoursFromNow(-4),
    created_at: hoursFromNow(-6),
    updated_at: hoursFromNow(-2),
  });
  for (const event of [
    { at: hoursFromNow(-6), kind: 'created', to_status: 'received', actor: firstResident },
    { at: hoursFromNow(-4), kind: 'status_changed', from_status: 'received', to_status: 'under_review', actor: serviceId },
    { at: hoursFromNow(-2), kind: 'assigned', from_status: 'under_review', to_status: 'assigned', actor: serviceId },
  ]) {
    await insert(client, 'case_events', {
      org_id: orgId,
      case_id: contractorCaseId,
      at: event.at,
      actor_user_id: event.actor,
      kind: event.kind,
      from_status: event.from_status ?? null,
      to_status: event.to_status,
      payload: JSON.stringify({}),
      visible_to_resident: true,
    });
  }
  const orderStart = atLocalTime(1, 13);
  await insert(client, 'work_orders', {
    org_id: orgId,
    case_id: contractorCaseId,
    number: `AO-${new Date().getFullYear()}-0001`,
    contractor_org_id: ctx.contractorOrgId,
    title: 'Felsök och åtgärda kallt element',
    instructions:
      'Lufta elementet och kontrollera termostaten. Byt termostat vid behov. Meddela hyresgästen innan besöket.',
    status: 'offered',
    planned_start: orderStart,
    planned_end: new Date(orderStart.getTime() + 2 * 3_600_000),
    created_by: serviceId,
  });

  /* -------------------------------------------- driftinformation m.m. --- */
  // Avstängningen läggs på nästa torsdag 09.00–12.00, så att texten stämmer.
  const shutoffDay = daysUntilWeekday(4, 2);
  const noticeId = await insert(client, 'notices', {
    org_id: orgId,
    kind: 'water_shutoff',
    severity: 'important',
    title: 'Vattnet stängs av på torsdag',
    body_html:
      '<p>På grund av ett planerat ledningsarbete stängs vattnet av i hela fastigheten torsdag klockan 09.00–12.00.</p><p>Tappa upp det vatten du behöver innan avstängningen. Efter påsläpp kan vattnet vara missfärgat en kort stund – spola tills det blir klart.</p>',
    summary: 'Vattnet är avstängt torsdag 09.00–12.00.',
    status: 'published',
    starts_at: atLocalTime(shutoffDay, 9),
    expected_end_at: atLocalTime(shutoffDay, 12),
    next_update_at: atLocalTime(shutoffDay, 12),
    published_at: hoursFromNow(-6),
    contact_info: `Frågor besvaras av kundservice på ${bp.supportPhone}.`,
    requires_acknowledgement: false,
    channels: ['inapp', 'push'],
    created_by: serviceId,
  });
  await insert(client, 'notice_audiences', { org_id: orgId, notice_id: noticeId, scope: 'property', scope_id: unit.propertyId });
  await client.query(
    'insert into notice_translations (org_id, notice_id, locale, title, body_html) values ($1,$2,$3,$4,$5)',
    [orgId, noticeId, 'en', 'Water will be shut off on Thursday', '<p>Because of planned pipework, the water will be shut off in the whole property on Thursday between 09.00 and 12.00.</p><p>Please fill containers with the water you need beforehand. The water may be discoloured briefly afterwards — run the tap until it clears.</p>'],
  );

  const newsId = await insert(client, 'notices', {
    org_id: orgId,
    kind: 'news',
    severity: 'info',
    title: 'Gårdsfest och container för grovsopor',
    body_html:
      '<p>Lördag den kommande helgen ställer vi ut en container för grovsopor på gården. Passa på att rensa i förrådet.</p><p>Klockan 14 bjuder områdesvärdarna på kaffe vid lekplatsen.</p>',
    summary: 'Container på gården och kaffe vid lekplatsen på lördag.',
    status: 'published',
    published_at: hoursFromNow(-72),
    pinned_until: daysFromNow(5),
    channels: ['inapp'],
    created_by: serviceId,
  });
  await insert(client, 'notice_audiences', { org_id: orgId, notice_id: newsId, scope: 'area', scope_id: unit.areaId });

  const scheduledId = await insert(client, 'notices', {
    org_id: orgId,
    kind: 'planned_maintenance',
    severity: 'info',
    title: 'Byte av portlås nästa månad',
    body_html: '<p>Under nästa månad byter vi lås i samtliga portar. Nya taggar delas ut i förväg.</p>',
    status: 'scheduled',
    publish_at: daysFromNow(14),
    unpublish_at: daysFromNow(45),
    channels: ['inapp', 'push'],
    created_by: serviceId,
  });
  await insert(client, 'notice_audiences', { org_id: orgId, notice_id: scheduledId, scope: 'organisation', scope_id: null });

  /* -------------------------------------------------------- bokning --- */
  const laundryId = ctx.resourceIds[0]!;
  // Tvättpasset ligger 18.00–21.00 svensk tid, inom tvättstugans öppettider.
  const laundryStart = atLocalTime(1, 18);
  const laundryEnd = new Date(laundryStart.getTime() + 3 * 3_600_000);
  await insert(client, 'bookings', {
    org_id: orgId,
    resource_id: laundryId,
    tenancy_id: tenancyId,
    user_id: firstResident,
    slot: `[${laundryStart.toISOString()},${laundryEnd.toISOString()})`,
    status: 'confirmed',
    created_by: firstResident,
  });

  /* ------------------------------------------------------- enkäter --- */
  const surveyId = await insert(client, 'surveys', {
    org_id: orgId,
    kind: 'resident_survey',
    title: 'Hur trivs du i ditt område?',
    description: 'Fem korta frågor om trivsel, trygghet och service. Svaren är anonyma.',
    status: 'open',
    anonymous: true,
    opens_at: hoursFromNow(-48),
    closes_at: daysFromNow(21),
    questions: JSON.stringify([
      { key: 'overall', label: 'Hur nöjd är du med ditt boende som helhet?', type: 'rating', required: true },
      { key: 'safety', label: 'Hur trygg känner du dig i området?', type: 'rating', required: true },
      { key: 'service', label: 'Hur nöjd är du med servicen vid felanmälan?', type: 'rating', required: false },
      { key: 'cleaning', label: 'Fungerar städningen i trapphuset?', type: 'boolean', required: false },
      { key: 'comment', label: 'Något du vill lyfta?', type: 'text', required: false },
    ]),
    created_by: serviceId,
  });
  await insert(client, 'survey_audiences', { org_id: orgId, survey_id: surveyId, scope: 'organisation', scope_id: null });

  /* ------------------------------------------- meddelande och notis --- */
  const threadId = await insert(client, 'threads', {
    org_id: orgId,
    subject: 'Fråga om parkeringsplats',
    tenancy_id: tenancyId,
    created_by: firstResident,
    status: 'open',
    last_message_at: hoursFromNow(-5),
    unread_for_staff: true,
  });
  await client.query('insert into thread_participants (org_id, thread_id, user_id, side) values ($1,$2,$3,$4)', [orgId, threadId, firstResident, 'resident']);
  await insert(client, 'messages', {
    org_id: orgId,
    thread_id: threadId,
    author_user_id: firstResident,
    body: 'Hej! Hur lång är kötiden för en parkeringsplats i garaget just nu?',
  });

  await insert(client, 'notifications', {
    org_id: orgId,
    user_id: firstResident,
    topic: 'operational_info',
    channel: 'inapp',
    title: 'Vattnet stängs av på torsdag',
    body: 'Vattnet är avstängt torsdag 09.00–12.00.',
    link_route: 'notice',
    link_id: noticeId,
    status: 'delivered',
    dedupe_key: `notice:${noticeId}`,
    sent_at: hoursFromNow(-6),
    delivered_at: hoursFromNow(-6),
  });

  /* ---------------------------------------------------- inflyttning --- */
  const flowId = await insert(client, 'move_flows', {
    org_id: orgId,
    tenancy_id: tenancyId,
    kind: 'move_in',
    move_date: isoDate(daysFromNow(-420)),
    status: 'active',
  });
  const moveSteps = [
    { key: 'sign_lease', title: 'Signera hyresavtalet', description: 'Läs igenom och signera avtalet digitalt.', status: 'done' },
    { key: 'choose_language', title: 'Välj kommunikationsspråk', description: 'Vi kontaktar dig på det språk du väljer.', status: 'done' },
    { key: 'book_keys', title: 'Boka nyckelhämtning', description: 'Välj en tid för att hämta dina nycklar.', status: 'done' },
    { key: 'register_co_resident', title: 'Registrera medboende', description: 'Bjud in den som ska bo med dig.', status: 'pending', required: false },
    { key: 'check_contact', title: 'Kontrollera kontaktuppgifter', description: 'Stämmer telefon och e-post?', status: 'pending' },
    { key: 'house_rules', title: 'Ta del av ordningsreglerna', description: 'Reglerna gäller alla som bor i huset.', status: 'pending' },
    { key: 'move_in_check', title: 'Genomför digital inflyttningskontroll', description: 'Gå igenom bostaden rum för rum.', status: 'pending' },
    { key: 'report_defects', title: 'Anmäl upptäckta brister', description: 'Brister du anmäler nu belastar inte dig vid utflytt.', status: 'pending', required: false },
    { key: 'activate_services', title: 'Aktivera tjänster', description: 'Bredband, el och hemförsäkring.', status: 'pending', required: false },
  ];
  for (const [index, step] of moveSteps.entries()) {
    await insert(client, 'move_steps', {
      org_id: orgId,
      flow_id: flowId,
      key: step.key,
      title: step.title,
      description: step.description,
      status: step.status,
      required: step.required ?? true,
      sort_order: index,
      completed_at: step.status === 'done' ? hoursFromNow(-1000) : null,
    });
  }
}
