import type { FastifyInstance } from 'fastify';
import { buildOpenApiDocument, type RouteRecord } from './document.js';

/**
 * API-beskrivning i OpenAPI-format (krav A.1.14).
 *
 * Dokumentet byggs från serverns verkliga ruttabell, så att beskrivningen inte
 * kan glida isär från det API som faktiskt körs.
 */
export async function registerOpenApiRoutes(app: FastifyInstance): Promise<void> {
  const routes: RouteRecord[] = [];
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) routes.push({ method, url: route.url });
  });

  app.get('/api/openapi.json', { config: { rateLimit: false } }, async () =>
    buildOpenApiDocument(routes),
  );
}
