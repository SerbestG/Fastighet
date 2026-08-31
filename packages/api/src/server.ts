import { buildApp } from './app.js';
import { config } from './config.js';
import { closePool } from './db/pool.js';
import { verifyTenantIsolation } from './db/verify-isolation.js';
import { startScheduler } from './jobs/scheduler.js';

async function main(): Promise<void> {
  // Servern startar inte om kundsepareringen inte är verksam.
  await verifyTenantIsolation();

  const app = await buildApp();
  const stopScheduler = config.jobs.enabled ? startScheduler(app.log) : null;

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'stänger ned');
    stopScheduler?.();
    await app.close();
    await closePool();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Hemvist API lyssnar på ${config.host}:${config.port}`);
}

main().catch((error) => {
  console.error('Servern kunde inte starta:', error instanceof Error ? error.message : error);
  process.exit(1);
});
