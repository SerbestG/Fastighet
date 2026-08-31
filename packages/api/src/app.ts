import { randomUUID } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { config, instanceId } from './config.js';
import { AppError } from './core/errors.js';
import { loadAuthContext } from './core/session.js';
import { registerRoutes } from './modules/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      // I testläge sätts nivån till silent, vilket också tystar begäranloggen.
      level: config.logging.level,
      // Loggarna får inte innehålla lösenord, tokens eller nycklar (krav C.3.2).
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.newPassword',
          'req.body.currentPassword',
          'req.body.refreshToken',
          'req.body.totp',
        ],
        censor: '[borttaget]',
      },
    },
    bodyLimit: 2 * 1024 * 1024,
    trustProxy: true,
    genReqId: () => `${instanceId}-${randomUUID().slice(0, 8)}`,
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    // Klienten talar alltid TLS mot API:et i drift (krav C.3.1, C.5.4).
    strictTransportSecurity: config.isProduction
      ? { maxAge: 63_072_000, includeSubDomains: true, preload: true }
      : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await app.register(cors, {
    origin: config.webOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  });

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    // Begränsningen räknas per konto när användaren är känd, annars per adress.
    keyGenerator: (request) => request.auth?.userId ?? request.ip,
    enableDraftSpec: true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.storage.maxFileBytes,
      files: config.storage.maxFilesPerRequest,
      fields: 20,
    },
  });

  // Spårnings-ID följer med i svaret och i loggarna, så att ett fel som en
  // användare rapporterar går att hitta (avsnitt 26 i kravbilden).
  app.addHook('onRequest', async (request, reply) => {
    request.traceId = String(request.id);
    reply.header('x-trace-id', request.traceId);
  });

  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return;
    const token = header.slice(7).trim();
    if (!token) return;
    try {
      const auth = await loadAuthContext(token);
      if (auth) request.auth = auth;
    } catch (error) {
      request.log.warn({ err: error }, 'kunde inte läsa sessionen');
    }
  });

  app.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: { code: 'not_found', message: 'Resursen hittades inte.', traceId: request.traceId },
    });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      if (error.status >= 500) {
        request.log.error({ err: error, internal: error.internal }, error.message);
      } else {
        request.log.info(
          { code: error.code, internal: error.internal, path: request.url },
          'begäran avvisades',
        );
      }
      reply.status(error.status).send({
        error: {
          code: error.code,
          message: error.message,
          issues: error.issues,
          traceId: request.traceId,
        },
      });
      return;
    }

    if (error instanceof ZodError) {
      reply.status(400).send({
        error: {
          code: 'validation_error',
          message: 'Kontrollera de markerade fälten.',
          issues: error.issues.map((issue) => ({
            path: issue.path.join('.') || '_',
            message: issue.message,
          })),
          traceId: request.traceId,
        },
      });
      return;
    }

    const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
    if (statusCode === 429) {
      reply.status(429).send({
        error: {
          code: 'rate_limited',
          message: 'För många försök. Vänta en stund och försök igen.',
          traceId: request.traceId,
        },
      });
      return;
    }
    if (statusCode === 413) {
      reply.status(413).send({
        error: { code: 'payload_too_large', message: 'Filen är för stor.', traceId: request.traceId },
      });
      return;
    }

    request.log.error({ err: error }, 'oväntat fel');
    // Tekniska detaljer lämnar aldrig servern; spårnings-ID:t kopplar ihop svaret
    // med loggraden.
    reply.status(statusCode >= 400 && statusCode < 500 ? statusCode : 500).send({
      error: {
        code: statusCode >= 400 && statusCode < 500 ? 'validation_error' : 'internal_error',
        message:
          statusCode >= 400 && statusCode < 500
            ? 'Begäran kunde inte tolkas.'
            : 'Ett tekniskt fel uppstod.',
        traceId: request.traceId,
      },
    });
  });

  await registerRoutes(app);
  return app;
}
