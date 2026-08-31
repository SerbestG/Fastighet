import { closePool } from './pool.js';
import { resetDatabase, runMigrations } from './migrate.js';
import { seed } from './seed.js';

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case 'migrate': {
      console.log('Kör migreringar…');
      const applied = await runMigrations();
      console.log(applied.length ? `Klart. ${applied.length} migrering(ar) kördes.` : 'Klart. Inget nytt.');
      break;
    }
    case 'seed': {
      console.log('Lägger in demodata…');
      await seed();
      console.log('Klart.');
      break;
    }
    case 'reset': {
      console.log('Återställer databasen…');
      await resetDatabase();
      await runMigrations();
      await seed();
      console.log('Klart.');
      break;
    }
    default:
      console.error('Använd: migrate | seed | reset');
      process.exitCode = 1;
  }
  await closePool();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
