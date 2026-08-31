import { resetDatabase, runMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { closePool } from '../src/db/pool.js';

/**
 * Bygger en ren testdatabas med demodata för två fastighetsbolag innan
 * testerna körs. Detta är samma migreringar och samma seed som används i drift.
 */
export async function setup(): Promise<void> {
  await resetDatabase(() => {});
  await runMigrations(() => {});
  await seed();
}

export async function teardown(): Promise<void> {
  await closePool();
}
