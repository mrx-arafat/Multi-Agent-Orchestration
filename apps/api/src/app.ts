import Fastify, { type FastifyInstance } from 'fastify';
import { getConfig, parseEnv, _resetEnvCache, type Env } from './config/index.js';
import { buildLoggerOptions } from './lib/logger.js';
import { errorHandlerPlugin } from './plugins/error-handler.js';
import { corsPlugin } from './plugins/cors.js';
import { databasePlugin } from './plugins/database.js';
import { authenticatePlugin } from './plugins/authenticate.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './modules/auth/routes.js';
import { agentRoutes } from './modules/agents/routes.js';
import { queuePlugin } from './plugins/queue.js';
import { workflowRoutes } from './modules/workflows/routes.js';
import { auditRoutes } from './modules/audit/routes.js';

// Type augmentations are in the database plugin

/**
 * Builds and configures the Fastify application instance.
 * This factory function is used for both production and testing
 * (each test gets a fresh app instance).
 *
 * @param envOverride - Optional env override (used in tests)
 */
export async function buildApp(envOverride?: Partial<Env>): Promise<FastifyInstance> {
  // Reset cache and parse env with overrides applied to a local copy
  if (envOverride) {
    _resetEnvCache();
  }
  const envSource = envOverride
    ? { ...process.env, ...envOverride }
    : process.env;
  const config = parseEnv(envSource as NodeJS.ProcessEnv);

  const app = Fastify({
    logger: buildLoggerOptions(config),
    requestIdLogLabel: 'requestId',
    genReqId: () => crypto.randomUUID(),
    ajv: {
      customOptions: {
        removeAdditional: 'all',
        coerceTypes: 'array',
        useDefaults: true,
      },
    },
  });

  // Handle empty body with Content-Type: application/json (common client pattern).
  // Without this, Fastify rejects DELETE/GET requests that include the header but no body.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      done(null, undefined);
      return;
    }
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  // ── Plugins ─────────────────────────────────────────────────────────────
  await corsPlugin(app, config);
  await app.register(errorHandlerPlugin);

  // Database & Redis plugin — connects to PostgreSQL and Redis
  // Skip in test env if MAOF_SKIP_DB is set (for unit tests without infrastructure)
  if (process.env['MAOF_SKIP_DB'] !== 'true') {
    await app.register(databasePlugin);
  } else {
    // In skip-DB mode, decorate with undefined so health check handles gracefully
    app.decorate('db', undefined as unknown as import('./db/index.js').Database);
    app.decorate('pool', undefined as unknown as import('pg').Pool);
    app.decorate('redis', undefined as unknown as import('ioredis').Redis);
  }

  // Auth plugin — JWT signing/verification + app.authenticate decorator
  await app.register(authenticatePlugin);

  // Queue plugin — BullMQ workflow queue + worker (requires database plugin)
  if (process.env['MAOF_SKIP_DB'] !== 'true') {
    await app.register(queuePlugin);
  }

  // ── Routes ──────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(agentRoutes);
  if (process.env['MAOF_SKIP_DB'] !== 'true') {
    await app.register(workflowRoutes);
    await app.register(auditRoutes);
  }

  return app;
}
