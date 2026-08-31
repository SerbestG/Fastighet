import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { config } from '../config.js';
import { createAdminPool } from './pool.js';

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

async function ensureAppRole(client: pg.PoolClient): Promise<void> {
  const { appUser, appPassword } = config.db;
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(appUser)) {
    throw new Error(`Ogiltigt rollnamn för applikationen: ${appUser}`);
  }
  // CREATE ROLE tar inte emot bindningsparametrar. Lösenordet escapas därför av
  // servern med quote_literal innan det sätts in i satsen.
  const quoted = await client.query<{ lit: string }>('select quote_literal($1::text) as lit', [
    appPassword,
  ]);
  const passwordLiteral = quoted.rows[0]!.lit;

  const exists = await client.query('select 1 from pg_roles where rolname = $1', [appUser]);
  if (exists.rowCount === 0) {
    await client.query(
      `create role ${appUser} with login nosuperuser nocreatedb nocreaterole nobypassrls password ${passwordLiteral}`,
    );
  } else {
    // Rollen får aldrig kringgå Row Level Security, även om den ändrats manuellt.
    await client.query(
      `alter role ${appUser} with login nosuperuser nobypassrls password ${passwordLiteral}`,
    );
  }
  await client.query(`grant connect on database ${quoteIdent(config.db.name)} to ${appUser}`);
}

function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

export async function runMigrations(log: (message: string) => void = console.log): Promise<string[]> {
  const pool = createAdminPool();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`create table if not exists schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now(),
      checksum text not null
    )`);

    await ensureAppRole(client);

    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    const done = await client.query<{ name: string; checksum: string }>(
      'select name, checksum from schema_migrations',
    );
    const doneMap = new Map(done.rows.map((r) => [r.name, r.checksum]));

    for (const file of files) {
      const sql = await readFile(join(migrationsDir, file), 'utf8');
      const checksum = await sha256(sql);
      const previous = doneMap.get(file);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `Migreringen ${file} har ändrats efter att den kördes. Lägg till en ny migrering i stället.`,
          );
        }
        continue;
      }
      log(`  → kör ${file}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query('insert into schema_migrations (name, checksum) values ($1, $2)', [
          file,
          checksum,
        ]);
        await client.query('commit');
        applied.push(file);
      } catch (error) {
        await client.query('rollback');
        throw new Error(`Migreringen ${file} misslyckades: ${(error as Error).message}`);
      }
    }

    // Rättigheterna körs varje gång så att nya tabeller alltid täcks in.
    const grants = await readFile(join(migrationsDir, '010_grants.sql'), 'utf8');
    await client.query(grants);
  } finally {
    client.release();
    await pool.end();
  }
  return applied;
}

export async function resetDatabase(log: (message: string) => void = console.log): Promise<void> {
  const pool = createAdminPool();
  const client = await pool.connect();
  try {
    log('  → tömmer schemat');
    await client.query('drop schema if exists public cascade');
    await client.query('drop schema if exists app cascade');
    await client.query('create schema public');
    await client.query(`grant all on schema public to ${config.db.appUser}`);
  } finally {
    client.release();
    await pool.end();
  }
}

async function sha256(value: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(value).digest('hex');
}
