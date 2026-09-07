import type { PropertySystemAdapter, SyncDataset, SyncPage, SyncRecord } from '../core/sync.js';

/**
 * Adapter mot fastighetssystemet Vitec (krav A.1.8, A.1.17–A.1.20).
 *
 * Avbildningen nedan är kontraktet mellan systemen. Den är avsiktligt explicit:
 * när fältnamnen hos leverantören är fastställda ändras bara den här filen, och
 * ingenting annat i plattformen behöver röras.
 *
 * Adaptern skapas bara när adress och nyckel finns. Utan dem sker ingen
 * synkronisering alls, och integrationsregistret visar det (krav C.3.13).
 */

/** Fälten plattformen behöver, och var de hämtas i källsystemet. */
export const FIELD_MAPPING = {
  customers: {
    externalRef: 'kundnummer',
    objectNumber: 'objektnummer',
    firstName: 'fornamn',
    lastName: 'efternamn',
    email: 'epost',
    phone: 'telefon',
    personalNumber: 'personnummer',
    coResident: 'medboende',
  },
  units: {
    externalRef: 'objektnummer',
    label: 'benamning',
    street: 'adress',
    postalCode: 'postnummer',
    city: 'ort',
    areaCode: 'omrade',
    propertyCode: 'fastighet',
    buildingCode: 'byggnad',
    entrance: 'trappuppgang',
    floorPlanUrl: 'planlosning',
  },
  tenancies: {
    externalRef: 'avtalsnummer',
    objectNumber: 'objektnummer',
    customerRef: 'kundnummer',
    startsAt: 'avtalsstart',
    earliestMoveOut: 'tidigaste_utflytt',
    monthlyRent: 'manadshyra',
    status: 'status',
  },
  invoices: {
    externalRef: 'fakturanummer',
    customerRef: 'kundnummer',
    contractRef: 'avtalsnummer',
    periodStart: 'periodstart',
    periodEnd: 'periodslut',
    dueDate: 'forfallodatum',
    amount: 'belopp',
    ocr: 'ocr',
    bankgiro: 'bankgiro',
    paid: 'betald',
  },
} as const;

const PATHS: Record<SyncDataset, string> = {
  customers: '/api/kunder/andrade',
  units: '/api/objekt/andrade',
  tenancies: '/api/avtal/andrade',
  invoices: '/api/avier/andrade',
};

interface VitecResponse {
  poster?: Record<string, unknown>[];
  nastaMarkor?: string | null;
}

export class VitecAdapter implements PropertySystemAdapter {
  readonly name = 'Vitec Hyra';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs = 20_000,
  ) {}

  async fetchChanges(dataset: SyncDataset, cursor: string | null): Promise<SyncPage> {
    const url = new URL(PATHS[dataset], this.baseUrl);
    if (cursor) url.searchParams.set('markor', cursor);

    const response = await fetch(url, {
      headers: {
        // Nyckeln skickas i huvudet och hamnar aldrig i en adress som loggas.
        authorization: `Bearer ${this.apiKey}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`Fastighetssystemet svarade ${response.status}.`);
    }

    const body = (await response.json()) as VitecResponse;
    const mapping = FIELD_MAPPING[dataset] as Record<string, string>;
    const records: SyncRecord[] = [];

    for (const row of body.poster ?? []) {
      const externalRef = row[mapping.externalRef!];
      if (typeof externalRef !== 'string' || !externalRef) continue;
      const data: Record<string, unknown> = {};
      for (const [ourName, theirName] of Object.entries(mapping)) {
        if (ourName === 'externalRef') continue;
        data[ourName] = row[theirName] ?? null;
      }
      records.push({ externalRef, data });
    }

    return { records, nextCursor: body.nastaMarkor ?? null };
  }

  async pushChange(kind: string, payload: Record<string, unknown>): Promise<void> {
    const response = await fetch(new URL('/api/handelser', this.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ typ: kind, data: payload }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Fastighetssystemet avvisade ändringen (${response.status}).`);
    }
  }
}
