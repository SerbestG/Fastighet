import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

// Numeriska typer läses som number där det är säkert (int8 kan överstiga
// Number.MAX_SAFE_INTEGER, men används här endast för räknare och loggrad-id:n).
pg.types.setTypeParser(20, (value) => Number(value));
pg.types.setTypeParser(1700, (value) => Number(value));

export type Queryable = pg.PoolClient | pg.Pool;

let appPool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!appPool) {
    appPool = new Pool({
      connectionString: config.db.appUrl,
      max: config.db.poolMax,
      statement_timeout: config.db.statementTimeoutMs,
      application_name: 'hemvist-api',
    });
    appPool.on('error', (error) => {
      // En idle-klient som dör ska inte fälla processen.
      console.error('[db] oväntat fel på pool-klient', error.message);
    });
  }
  return appPool;
}

export function createAdminPool(): pg.Pool {
  return new Pool({ connectionString: config.db.adminUrl, max: 4, application_name: 'hemvist-admin' });
}

export async function closePool(): Promise<void> {
  if (appPool) {
    const pool = appPool;
    appPool = null;
    await pool.end();
  }
}

export interface OrgContext {
  orgId: string;
  userId?: string | null;
}

/**
 * Kör arbetet i en transaktion där organisationen är satt för sessionen.
 *
 * `SET LOCAL` gäller bara transaktionen och nollställs när den avslutas, vilket
 * gör att en återanvänd anslutning aldrig kan bära med sig fel organisation.
 * Värdet skickas som parameter till set_config och kan därför inte injiceras.
 */
export async function withOrg<T>(
  ctx: OrgContext,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    await client.query('select set_config($1, $2, true)', ['app.org_id', ctx.orgId]);
    if (ctx.userId) {
      await client.query('select set_config($1, $2, true)', ['app.user_id', ctx.userId]);
    }
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      // Rollback kan misslyckas om anslutningen redan är bruten.
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Transaktion utan organisationskontext. Används enbart för åtgärder som sker
 * innan organisationen är känd, till exempel uppslag av inloggningsförsök.
 */
export async function withoutOrg<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    try {
      await client.query('rollback');
    } catch {
      /* ignoreras */
    }
    throw error;
  } finally {
    client.release();
  }
}
