import { writeFile } from 'node:fs/promises';
import { buildApp } from '../app.js';
import { closePool } from '../db/pool.js';

/** Skriver ut API-beskrivningen till fil, för leverans till beställaren. */
async function main(): Promise<void> {
  const app = await buildApp();
  await app.ready();
  const response = await app.inject({ method: 'GET', url: '/api/openapi.json' });
  const target = process.argv[3] ?? 'openapi.json';
  await writeFile(target, JSON.stringify(response.json(), null, 2), 'utf8');
  console.log(`Skrev ${target}`);
  await app.close();
  await closePool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
