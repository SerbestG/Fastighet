import type { FastifyInstance } from 'fastify';
import { getPool } from '../db/pool.js';

export async function registerHealthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    time: new Date().toISOString(),
  }));

  /** Beredskapskontroll: används av driftövervakningen (krav C.8.4). */
  app.get('/api/health/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    try {
      await getPool().query('select 1');
      return { status: 'ready' };
    } catch {
      reply.status(503);
      return { status: 'unavailable', reason: 'databasen svarar inte' };
    }
  });
}
