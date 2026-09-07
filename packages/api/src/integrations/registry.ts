import type pg from 'pg';
import type { PropertySystemAdapter } from '../core/sync.js';
import { VitecAdapter } from './vitec.js';

/**
 * Vilken adapter som gäller för en organisation.
 *
 * Adaptern skapas bara när integrationen är ansluten *och* har både adress och
 * autentiseringsuppgift. Saknas något finns ingen adapter, och ingen
 * synkronisering sker – i stället visar registret att uppgifter saknas.
 */

/** Adaptrar som går att välja, indexerade på integrationens `kind`. */
type Factory = (baseUrl: string, apiKey: string) => PropertySystemAdapter;

const FACTORIES: Record<string, Factory> = {
  property_system: (baseUrl, apiKey) => new VitecAdapter(baseUrl, apiKey),
};

export interface AdapterResult {
  adapter: PropertySystemAdapter | null;
  /** Varför ingen adapter finns, för att kunna visa det i registret. */
  reason: 'ok' | 'not_connected' | 'missing_credentials' | 'unsupported';
  integrationId: string | null;
}

export async function propertySystemAdapter(
  client: pg.PoolClient,
  credentials: (integrationId: string) => Promise<string | null>,
): Promise<AdapterResult> {
  const result = await client.query<{
    id: string;
    kind: string;
    status: string;
    base_url: string | null;
  }>(`select id, kind, status, base_url from integrations where kind = 'property_system' limit 1`);

  const row = result.rows[0];
  if (!row) return { adapter: null, reason: 'unsupported', integrationId: null };
  if (row.status !== 'connected' && row.status !== 'sandbox') {
    return { adapter: null, reason: 'not_connected', integrationId: row.id };
  }
  if (!row.base_url) return { adapter: null, reason: 'missing_credentials', integrationId: row.id };

  const apiKey = await credentials(row.id);
  if (!apiKey) return { adapter: null, reason: 'missing_credentials', integrationId: row.id };

  const factory = FACTORIES[row.kind];
  if (!factory) return { adapter: null, reason: 'unsupported', integrationId: row.id };

  return { adapter: factory(row.base_url, apiKey), reason: 'ok', integrationId: row.id };
}
