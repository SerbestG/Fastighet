import { getPool } from './pool.js';

/**
 * Kontrollerar vid uppstart att kundsepareringen verkligen är aktiv.
 *
 * Row Level Security kringgås av superuser-roller och av roller med BYPASSRLS.
 * Om applikationen av misstag konfigureras med en sådan roll blir policyerna
 * verkningslösa utan att något syns i loggarna. Servern startar därför inte alls
 * i det läget.
 */
export async function verifyTenantIsolation(): Promise<void> {
  const pool = getPool();

  const role = await pool.query<{
    rolsuper: boolean;
    rolbypassrls: boolean;
    current_user: string;
  }>(
    `select r.rolsuper, r.rolbypassrls, current_user
       from pg_roles r
      where r.rolname = current_user`,
  );

  const row = role.rows[0];
  if (!row) throw new Error('Kunde inte läsa rollinformation för databasanvändaren.');
  if (row.rolsuper || row.rolbypassrls) {
    throw new Error(
      `Databasanvändaren "${row.current_user}" kringgår Row Level Security ` +
        '(superuser eller BYPASSRLS). Kundsepareringen skulle inte ha någon verkan. ' +
        'Använd en dedikerad applikationsroll, t.ex. hemvist_app.',
    );
  }

  const unprotected = await pool.query<{ relname: string }>(
    `select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'org_id' and a.attnum > 0
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false`,
  );
  if (unprotected.rowCount) {
    throw new Error(
      'Följande tabeller saknar Row Level Security: ' +
        unprotected.rows.map((r) => r.relname).join(', '),
    );
  }

  // Utan satt organisation ska ingen kunddata vara läsbar.
  const leak = await pool.query<{ count: number }>('select count(*)::int as count from users');
  if ((leak.rows[0]?.count ?? 0) > 0) {
    throw new Error('Row Level Security släpper igenom rader utan satt organisation.');
  }
}
