import { beforeAll, describe, expect, it } from 'vitest';
import {
  type PropertySystemAdapter,
  type SyncDataset,
  type SyncPage,
  backoffSeconds,
  freshness,
  readStates,
  runDataset,
} from '../src/core/sync.js';
import { APPLIERS } from '../src/integrations/apply.js';
import { createAdminPool, withOrg } from '../src/db/pool.js';
import { ACCOUNTS } from './helpers.js';

/**
 * Synkronisering mot verksamhetssystem (krav A.1.8, C.3.5, C.3.10, C.3.11, C.3.13).
 *
 * Adaptern nedan spelar ett källsystem som ibland svarar fel, ibland skickar
 * ofullständiga poster. Det som prövas är att plattformen då behåller gamla,
 * korrekta uppgifter och märker dem som gamla i stället för att skriva in skräp.
 */

class TestAdapter implements PropertySystemAdapter {
  readonly name = 'Testsystem';
  failNext = false;
  pages = new Map<SyncDataset, SyncPage>();
  pushed: { kind: string; payload: Record<string, unknown> }[] = [];

  async fetchChanges(dataset: SyncDataset): Promise<SyncPage> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('källsystemet svarade 503');
    }
    return this.pages.get(dataset) ?? { records: [], nextCursor: null };
  }

  async pushChange(kind: string, payload: Record<string, unknown>): Promise<void> {
    this.pushed.push({ kind, payload });
  }
}

let orgId: string;
let objectNumber: string;

beforeAll(async () => {
  const pool = createAdminPool();
  try {
    const org = await pool.query<{ id: string }>('select id from organisations where slug = $1', [
      ACCOUNTS.orgA.slug,
    ]);
    orgId = org.rows[0]!.id;
    const unit = await pool.query<{ object_number: string }>(
      'select object_number from units where org_id = $1 order by object_number limit 1',
      [orgId],
    );
    objectNumber = unit.rows[0]!.object_number;
  } finally {
    await pool.end();
  }
});

describe('Synkronisering mot verksamhetssystem', () => {
  it('fördröjningen växer men planar ut', () => {
    expect(backoffSeconds(1)).toBe(60);
    expect(backoffSeconds(2)).toBe(120);
    expect(backoffSeconds(4)).toBe(480);
    expect(backoffSeconds(20)).toBe(3600);
  });

  it('färskheten redovisar att en hämtning aldrig skett', () => {
    expect(freshness(null, true)).toBe('never');
    expect(freshness(null, false)).toBe('not_connected');
  });

  it('färskheten slår om till inaktuell när det gått för lång tid', () => {
    const base = {
      dataset: 'invoices' as const,
      lastAttemptAt: new Date(),
      lastError: null,
      consecutiveFailures: 0,
      staleAfterMinutes: 60,
    };
    expect(freshness({ ...base, lastSuccessAt: new Date() }, true)).toBe('fresh');
    expect(
      freshness({ ...base, lastSuccessAt: new Date(Date.now() - 120 * 60_000) }, true),
    ).toBe('stale');
  });

  it('skriver in hämtade avtal och uppdaterar färskheten', async () => {
    const adapter = new TestAdapter();
    adapter.pages.set('tenancies', {
      records: [
        {
          externalRef: 'AVTAL-TEST-1',
          data: {
            objectNumber,
            startsAt: '2024-01-01',
            earliestMoveOut: '2026-12-31',
            monthlyRent: 9500,
            status: 'active',
          },
        },
      ],
      nextCursor: 'markor-1',
    });

    const outcome = await withOrg({ orgId }, (client) =>
      runDataset(client, orgId, 'tenancies', adapter, (c, record) =>
        APPLIERS.tenancies(c, orgId, record),
      ),
    );
    expect(outcome.ok).toBe(true);
    expect(outcome.applied).toBe(1);
    expect(outcome.skipped).toBe(0);

    const states = await withOrg({ orgId }, (client) => readStates(client));
    expect(states.get('tenancies')?.lastSuccessAt).toBeTruthy();
    expect(freshness(states.get('tenancies') ?? null, true)).toBe('fresh');
  });

  it('en ofullständig post hoppas över utan att stoppa de övriga', async () => {
    const adapter = new TestAdapter();
    adapter.pages.set('tenancies', {
      records: [
        // Saknar avtalsstart och ska inte skrivas.
        { externalRef: 'AVTAL-TRASIG', data: { objectNumber, monthlyRent: 1000 } },
        {
          externalRef: 'AVTAL-TEST-2',
          data: { objectNumber, startsAt: '2024-02-01', monthlyRent: 8000, status: 'active' },
        },
      ],
      nextCursor: 'markor-2',
    });

    const outcome = await withOrg({ orgId }, (client) =>
      runDataset(client, orgId, 'tenancies', adapter, (c, record) =>
        APPLIERS.tenancies(c, orgId, record),
      ),
    );
    expect(outcome.applied).toBe(1);
    expect(outcome.skipped).toBe(1);

    const pool = createAdminPool();
    try {
      const broken = await pool.query(
        'select 1 from tenancies where org_id = $1 and external_ref = $2',
        [orgId, 'AVTAL-TRASIG'],
      );
      expect(broken.rowCount).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it('markören flyttas inte när en post hoppats över', async () => {
    const pool = createAdminPool();
    try {
      const state = await pool.query<{ cursor: string | null }>(
        'select cursor from sync_datasets where org_id = $1 and dataset = $2',
        [orgId, 'tenancies'],
      );
      // Förra körningen hade en trasig post, så markören står kvar på markor-1.
      expect(state.rows[0]!.cursor).toBe('markor-1');
    } finally {
      await pool.end();
    }
  });

  it('ett fel ger växande fördröjning och behåller den senast lyckade tiden', async () => {
    const before = await withOrg({ orgId }, (client) => readStates(client));
    const successBefore = before.get('tenancies')?.lastSuccessAt;

    const adapter = new TestAdapter();
    adapter.failNext = true;
    const outcome = await withOrg({ orgId }, (client) =>
      runDataset(client, orgId, 'tenancies', adapter, (c, record) =>
        APPLIERS.tenancies(c, orgId, record),
      ),
    );
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain('503');

    const after = await withOrg({ orgId }, (client) => readStates(client));
    expect(after.get('tenancies')?.lastSuccessAt?.getTime()).toBe(successBefore?.getTime());
    expect(after.get('tenancies')?.consecutiveFailures).toBe(1);
    expect(after.get('tenancies')?.lastError).toContain('503');

    const pool = createAdminPool();
    try {
      const next = await pool.query<{ next_attempt_at: Date | null }>(
        'select next_attempt_at from sync_datasets where org_id = $1 and dataset = $2',
        [orgId, 'tenancies'],
      );
      expect(next.rows[0]!.next_attempt_at).toBeTruthy();
    } finally {
      await pool.end();
    }
  });

  it('avier kopplas till rätt avtal och får rätt status', async () => {
    const adapter = new TestAdapter();
    adapter.pages.set('invoices', {
      records: [
        {
          externalRef: 'FAKT-TEST-1',
          data: {
            contractRef: 'AVTAL-TEST-1',
            periodStart: '2026-10-01',
            periodEnd: '2026-10-31',
            dueDate: '2099-10-28',
            amount: 9500,
            ocr: '4922139999',
            bankgiro: '5051-6905',
            paid: false,
          },
        },
      ],
      nextCursor: null,
    });

    const outcome = await withOrg({ orgId }, (client) =>
      runDataset(client, orgId, 'invoices', adapter, (c, record) =>
        APPLIERS.invoices(c, orgId, record),
      ),
    );
    expect(outcome.applied).toBe(1);

    const pool = createAdminPool();
    try {
      const invoice = await pool.query<{ amount_ore: number; status: string; ocr: string }>(
        'select amount_ore, status, ocr from invoices where org_id = $1 and external_ref = $2',
        [orgId, 'FAKT-TEST-1'],
      );
      expect(invoice.rows[0]!.amount_ore).toBe(950_000);
      expect(invoice.rows[0]!.status).toBe('open');
      expect(invoice.rows[0]!.ocr).toBe('4922139999');
    } finally {
      await pool.end();
    }
  });

  it('en avi utan känt avtal skrivs inte in', async () => {
    const adapter = new TestAdapter();
    adapter.pages.set('invoices', {
      records: [
        {
          externalRef: 'FAKT-UTAN-AVTAL',
          data: {
            contractRef: 'AVTAL-FINNS-INTE',
            periodStart: '2026-10-01',
            periodEnd: '2026-10-31',
            dueDate: '2026-10-28',
            amount: 1000,
            ocr: '1',
            bankgiro: '2',
            paid: false,
          },
        },
      ],
      nextCursor: null,
    });

    const outcome = await withOrg({ orgId }, (client) =>
      runDataset(client, orgId, 'invoices', adapter, (c, record) =>
        APPLIERS.invoices(c, orgId, record),
      ),
    );
    expect(outcome.applied).toBe(0);
    expect(outcome.skipped).toBe(1);

    const pool = createAdminPool();
    try {
      const rows = await pool.query('select 1 from invoices where external_ref = $1', [
        'FAKT-UTAN-AVTAL',
      ]);
      expect(rows.rowCount).toBe(0);
    } finally {
      await pool.end();
    }
  });

  it('synkade uppgifter hamnar bara hos rätt fastighetsbolag', async () => {
    const pool = createAdminPool();
    try {
      const rows = await pool.query<{ org_id: string }>(
        'select org_id from tenancies where external_ref = $1',
        ['AVTAL-TEST-1'],
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0]!.org_id).toBe(orgId);
    } finally {
      await pool.end();
    }
  });
});
