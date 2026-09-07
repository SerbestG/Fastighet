import type pg from 'pg';

/**
 * Synkronisering mot verksamhetssystem (krav A.1.8, C.3.5, C.3.10, C.3.11).
 *
 * Motorn vet ingenting om vilket system det är. Den vet bara att en datamängd
 * ska hämtas, att fel ska hanteras med växande fördröjning, och att en post som
 * inte gick att tolka aldrig får skrivas in halvfärdig – hellre en tydlig
 * markering att uppgifterna är gamla än ett tyst fel i kunddata.
 */

export const SYNC_DATASETS = ['customers', 'units', 'tenancies', 'invoices'] as const;
export type SyncDataset = (typeof SYNC_DATASETS)[number];

export const DATASET_LABELS: Record<SyncDataset, { sv: string; en: string }> = {
  customers: { sv: 'Kunduppgifter', en: 'Customer records' },
  units: { sv: 'Hyresobjekt', en: 'Units' },
  tenancies: { sv: 'Hyresavtal', en: 'Tenancies' },
  invoices: { sv: 'Hyresavier', en: 'Invoices' },
};

/** En hämtad post. `externalRef` är källsystemets nyckel. */
export interface SyncRecord {
  externalRef: string;
  data: Record<string, unknown>;
}

export interface SyncPage {
  records: SyncRecord[];
  /** Markör att fortsätta från nästa gång. Null när allt är hämtat. */
  nextCursor: string | null;
}

/**
 * Vad ett verksamhetssystem behöver kunna för att plattformen ska kunna hämta
 * och lämna uppgifter. Adaptern översätter systemets format till det här.
 */
export interface PropertySystemAdapter {
  readonly name: string;
  /** Hämtar ändringar sedan markören. */
  fetchChanges(dataset: SyncDataset, cursor: string | null): Promise<SyncPage>;
  /** Lämnar en ändring till källsystemet. Kastar vid fel. */
  pushChange(kind: string, payload: Record<string, unknown>): Promise<void>;
}

/* ------------------------------------------------------------ fördröjning --- */

/**
 * Väntetid efter misslyckade försök. Växer snabbt men planar ut, så att ett
 * system som varit nere länge ändå prövas med jämna mellanrum.
 */
export function backoffSeconds(consecutiveFailures: number): number {
  const base = 60;
  const capped = Math.min(consecutiveFailures, 8);
  return Math.min(base * 2 ** Math.max(0, capped - 1), 3600);
}

/* -------------------------------------------------------------- färskhet --- */

export interface DatasetState {
  dataset: SyncDataset;
  lastSuccessAt: Date | null;
  lastAttemptAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
  staleAfterMinutes: number;
}

export type Freshness = 'fresh' | 'stale' | 'never' | 'not_connected';

/**
 * Hur aktuella uppgifterna är. `never` betyder att ingen hämtning lyckats än,
 * `stale` att det gått för lång tid – båda ska synas för användaren (krav C.3.13).
 */
export function freshness(state: DatasetState | null, connected: boolean): Freshness {
  if (!connected) return 'not_connected';
  if (!state?.lastSuccessAt) return 'never';
  const ageMinutes = (Date.now() - state.lastSuccessAt.getTime()) / 60_000;
  return ageMinutes > state.staleAfterMinutes ? 'stale' : 'fresh';
}

/** Läser tillståndet för samtliga datamängder. */
export async function readStates(client: pg.PoolClient): Promise<Map<SyncDataset, DatasetState>> {
  const result = await client.query<{
    dataset: SyncDataset;
    last_success_at: Date | null;
    last_attempt_at: Date | null;
    last_error: string | null;
    consecutive_failures: number;
    stale_after_minutes: number;
  }>(
    `select dataset, last_success_at, last_attempt_at, last_error, consecutive_failures,
            stale_after_minutes
       from sync_datasets`,
  );
  return new Map(
    result.rows.map((row) => [
      row.dataset,
      {
        dataset: row.dataset,
        lastSuccessAt: row.last_success_at,
        lastAttemptAt: row.last_attempt_at,
        lastError: row.last_error,
        consecutiveFailures: row.consecutive_failures,
        staleAfterMinutes: row.stale_after_minutes,
      },
    ]),
  );
}

/* ------------------------------------------------------------- körningen --- */

export interface SyncOutcome {
  dataset: SyncDataset;
  applied: number;
  skipped: number;
  ok: boolean;
  error?: string;
}

/**
 * Kör en datamängd.
 *
 * Poster som inte går att tolka räknas som överhoppade och skrivs inte, men
 * stoppar inte de övriga. Går själva hämtningen fel behålls markören, så att
 * nästa försök tar om samma fönster i stället för att hoppa över ändringar.
 */
export async function runDataset(
  client: pg.PoolClient,
  orgId: string,
  dataset: SyncDataset,
  adapter: PropertySystemAdapter,
  apply: (client: pg.PoolClient, record: SyncRecord) => Promise<boolean>,
): Promise<SyncOutcome> {
  const stateRow = await client.query<{ cursor: string | null; consecutive_failures: number }>(
    'select cursor, consecutive_failures from sync_datasets where org_id = $1 and dataset = $2',
    [orgId, dataset],
  );
  const cursor = stateRow.rows[0]?.cursor ?? null;
  const failures = stateRow.rows[0]?.consecutive_failures ?? 0;

  await client.query(
    `insert into sync_datasets (org_id, dataset, last_attempt_at, updated_at)
     values ($1,$2, now(), now())
     on conflict (org_id, dataset) do update set last_attempt_at = now(), updated_at = now()`,
    [orgId, dataset],
  );

  let page: SyncPage;
  try {
    page = await adapter.fetchChanges(dataset, cursor);
  } catch (error) {
    const nextFailures = failures + 1;
    await client.query(
      `update sync_datasets
          set consecutive_failures = $3,
              last_error = $4,
              next_attempt_at = now() + make_interval(secs => $5),
              updated_at = now()
        where org_id = $1 and dataset = $2`,
      [orgId, dataset, nextFailures, (error as Error).message.slice(0, 500), backoffSeconds(nextFailures)],
    );
    return { dataset, applied: 0, skipped: 0, ok: false, error: (error as Error).message };
  }

  let applied = 0;
  let skipped = 0;
  for (const [index, record] of page.records.entries()) {
    // Varje post skrivs i en egen sparpunkt. Utan den skulle ett fel på en post
    // avbryta hela transaktionen, och resten av sidan gå förlorad.
    const savepoint = `sync_${index}`;
    await client.query(`savepoint ${savepoint}`);
    try {
      const changed = await apply(client, record);
      if (changed) applied += 1;
      else skipped += 1;
      await client.query(`release savepoint ${savepoint}`);
    } catch {
      // En post som inte går att skriva hoppas över. Den kommer tillbaka nästa
      // gång, eftersom markören bara flyttas när hela sidan gått igenom.
      await client.query(`rollback to savepoint ${savepoint}`);
      await client.query(`release savepoint ${savepoint}`);
      skipped += 1;
    }
  }

  await client.query(
    `update sync_datasets
        set cursor = case when $3 = 0 then $4 else cursor end,
            last_success_at = now(),
            consecutive_failures = 0,
            last_error = null,
            next_attempt_at = null,
            rows_last_run = $5,
            updated_at = now()
      where org_id = $1 and dataset = $2`,
    [orgId, dataset, skipped, page.nextCursor, page.records.length],
  );

  return { dataset, applied, skipped, ok: true };
}
