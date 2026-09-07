import type pg from 'pg';
import type { SyncDataset, SyncRecord } from '../core/sync.js';
import { lookupHash } from '../core/crypto.js';

/**
 * Skriver in hämtade poster (krav A.1.17–A.1.20).
 *
 * Varje post kontrolleras innan den skrivs. Saknas ett fält som behövs kastas
 * ett fel, posten hoppas över och markören står kvar – hellre gamla uppgifter
 * som är märkta som gamla än nya som är fel (krav C.3.11).
 */

function text(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number') return String(value);
  return null;
}

function required(value: unknown, field: string): string {
  const result = text(value);
  if (!result) throw new Error(`Fältet ${field} saknas.`);
  return result;
}

function date(value: unknown, field: string): string {
  const result = required(value, field);
  if (!/^\d{4}-\d{2}-\d{2}/.test(result)) throw new Error(`Fältet ${field} är inget datum.`);
  return result.slice(0, 10);
}

function optionalDate(value: unknown, field: string): string | null {
  return text(value) ? date(value, field) : null;
}

function ore(value: unknown, field: string): number {
  const number = typeof value === 'number' ? value : Number(text(value)?.replace(',', '.'));
  if (!Number.isFinite(number)) throw new Error(`Fältet ${field} är inget belopp.`);
  return Math.round(number * 100);
}

type Applier = (client: pg.PoolClient, orgId: string, record: SyncRecord) => Promise<boolean>;

/**
 * Kunduppgifter. Endast de fält källsystemet äger skrivs över; det användaren
 * själv styr i appen, som språk och notisval, lämnas orört.
 */
const applyCustomer: Applier = async (client, orgId, record) => {
  const email = required(record.data.email, 'epost').toLowerCase();
  const firstName = required(record.data.firstName, 'fornamn');
  const lastName = required(record.data.lastName, 'efternamn');
  const personalNumber = text(record.data.personalNumber);

  const result = await client.query(
    `insert into users (org_id, email, first_name, last_name, phone, external_ref,
                        personal_number_hash, status)
     values ($1,$2,$3,$4,$5,$6,$7,'active')
     on conflict (org_id, lower(email)) do update
       set first_name = excluded.first_name,
           last_name = excluded.last_name,
           phone = coalesce(excluded.phone, users.phone),
           external_ref = excluded.external_ref,
           personal_number_hash = coalesce(excluded.personal_number_hash, users.personal_number_hash),
           updated_at = now()`,
    [
      orgId,
      email,
      firstName,
      lastName,
      text(record.data.phone),
      record.externalRef,
      // Personnumret lagras bara som pepprad hash (krav C.2.2).
      personalNumber ? lookupHash(personalNumber.replace(/\D/g, '')) : null,
    ],
  );
  return (result.rowCount ?? 0) > 0;
};

/**
 * Hyresobjekt. Objektet hänger på en trappuppgång, så strukturen måste finnas
 * innan objekten kan komma in. Saknas den skrivs ingenting.
 */
const applyUnit: Applier = async (client, orgId, record) => {
  const buildingName = required(record.data.buildingCode, 'byggnad');
  const entranceName = text(record.data.entrance);

  const entrance = await client.query<{ id: string }>(
    `select e.id
       from entrances e
       join buildings b on b.id = e.building_id
      where e.org_id = $1
        and lower(b.name) = lower($2)
        and ($3::text is null or lower(e.name) = lower($3))
      order by (lower(e.name) = lower(coalesce($3, e.name))) desc
      limit 1`,
    [orgId, buildingName, entranceName],
  );
  const entranceId = entrance.rows[0]?.id;
  if (!entranceId) throw new Error(`Trappuppgången för ${buildingName} finns inte i strukturen.`);

  const result = await client.query(
    `insert into units (org_id, entrance_id, object_number, label)
     values ($1,$2,$3,$4)
     on conflict (org_id, object_number) do update
       set label = excluded.label,
           entrance_id = excluded.entrance_id,
           updated_at = now()`,
    [orgId, entranceId, record.externalRef, text(record.data.label) ?? record.externalRef],
  );
  return (result.rowCount ?? 0) > 0;
};

/** Hyresavtal, inklusive tidigaste utflyttsdatum (krav B.1.12, A.1.19). */
const applyTenancy: Applier = async (client, orgId, record) => {
  const objectNumber = required(record.data.objectNumber, 'objektnummer');
  const unit = await client.query<{ id: string }>(
    'select id from units where org_id = $1 and object_number = $2',
    [orgId, objectNumber],
  );
  const unitId = unit.rows[0]?.id;
  if (!unitId) throw new Error(`Objektet ${objectNumber} finns inte.`);

  const status = text(record.data.status) ?? 'active';
  if (!['upcoming', 'active', 'notice_given', 'ended'].includes(status)) {
    throw new Error(`Okänd avtalsstatus: ${status}.`);
  }

  const result = await client.query(
    `insert into tenancies (org_id, unit_id, external_ref, starts_at, earliest_move_out,
                            monthly_rent_ore, status)
     values ($1,$2,$3,$4,$5,$6,$7)
     on conflict (org_id, external_ref) where external_ref is not null do update
       set unit_id = excluded.unit_id,
           starts_at = excluded.starts_at,
           earliest_move_out = excluded.earliest_move_out,
           monthly_rent_ore = excluded.monthly_rent_ore,
           status = excluded.status,
           updated_at = now()`,
    [
      orgId,
      unitId,
      record.externalRef,
      date(record.data.startsAt, 'avtalsstart'),
      optionalDate(record.data.earliestMoveOut, 'tidigaste_utflytt'),
      ore(record.data.monthlyRent, 'manadshyra'),
      status,
    ],
  );
  return (result.rowCount ?? 0) > 0;
};

/** Hyresavier med de fält kunden ska kunna se (krav B.1.13, A.1.20). */
const applyInvoice: Applier = async (client, orgId, record) => {
  const contractRef = required(record.data.contractRef, 'avtalsnummer');
  const tenancy = await client.query<{ id: string }>(
    'select id from tenancies where org_id = $1 and external_ref = $2',
    [orgId, contractRef],
  );
  const tenancyId = tenancy.rows[0]?.id;
  if (!tenancyId) throw new Error(`Avtalet ${contractRef} finns inte.`);

  const paid = record.data.paid === true || text(record.data.paid) === 'true';
  const dueDate = date(record.data.dueDate, 'forfallodatum');
  // Förfallen räknas fram här, så att status stämmer även om ekonomisystemet
  // bara skickar betald eller obetald.
  const status = paid ? 'paid' : new Date(dueDate) < new Date() ? 'overdue' : 'open';

  const result = await client.query(
    `insert into invoices (org_id, tenancy_id, invoice_number, external_ref, period_start,
                           period_end, due_date, amount_ore, ocr, bankgiro, status, synced_at)
     values ($1,$2,$3,$3,$4,$5,$6,$7,$8,$9,$10, now())
     on conflict (org_id, invoice_number) do update
       set tenancy_id = excluded.tenancy_id,
           period_start = excluded.period_start,
           period_end = excluded.period_end,
           due_date = excluded.due_date,
           amount_ore = excluded.amount_ore,
           ocr = excluded.ocr,
           bankgiro = excluded.bankgiro,
           status = excluded.status,
           synced_at = now(),
           updated_at = now()`,
    [
      orgId,
      tenancyId,
      record.externalRef,
      date(record.data.periodStart, 'periodstart'),
      date(record.data.periodEnd, 'periodslut'),
      dueDate,
      ore(record.data.amount, 'belopp'),
      required(record.data.ocr, 'ocr'),
      required(record.data.bankgiro, 'bankgiro'),
      status,
    ],
  );
  return (result.rowCount ?? 0) > 0;
};

export const APPLIERS: Record<SyncDataset, Applier> = {
  customers: applyCustomer,
  units: applyUnit,
  tenancies: applyTenancy,
  invoices: applyInvoice,
};
