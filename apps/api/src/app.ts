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
import { memoryRoutes } from './modules/memory/routes.js';
import { teamRoutes } from './modules/teams/routes.js';
import { kanbanRoutes } from './modules/kanban/routes.js';
import { messagingRoutes } from './modules/messaging/routes.js';
import { websocketPlugin } from './plugins/websocket.js';
import { templateRoutes } from './modules/templates/routes.js';
import { notificationRoutes } from './modules/notifications/routes.js';
import { seedTemplates } from './modules/templates/seed.js';
import { initProviders, getConfiguredProviders } from './lib/ai-providers/index.js';
import { seedBuiltinAgents } from './modules/builtin-agents/index.js';
import { builtinAgentRoutes } from './modules/builtin-agents/routes.js';
import { analyticsRoutes } from './modules/analytics/routes.js';
import { agentOpsRoutes } from './modules/agent-ops/routes.js';
import { webhookRoutes } from './modules/webhooks/routes.js';
import { metricsRoutes } from './modules/metrics/routes.js';
import { approvalRoutes } from './modules/approvals/routes.js';
import { a2aRoutes } from './modules/a2a/routes.js';
import { registerWebhookDelivery } from './lib/event-bus.js';
import { deliverWebhookEvent } from './modules/webhooks/service.js';
// Phase 10: Enterprise features
import { agentMemoryRoutes } from './modules/agent-memory/routes.js';
import { conflictResolutionRoutes } from './modules/conflict-resolution/routes.js';
import { sandboxRoutes } from './modules/sandbox/routes.js';
import { budgetRoutes } from './modules/budgets/routes.js';
import { agentPermissionRoutes } from './modules/agent-permissions/routes.js';
import { agentVersionRoutes } from './modules/agent-versions/routes.js';
import { resultCacheRoutes } from './modules/result-cache/routes.js';

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

  // WebSocket plugin — real-time event streaming (requires auth plugin)
  if (process.env['MAOF_SKIP_DB'] !== 'true') {
    await app.register(websocketPlugin);
  }

  // AI Providers — initialise from env (Phase 4)
  initProviders({
    openaiApiKey: config.MAOF_OPENAI_API_KEY,
    anthropicApiKey: config.MAOF_ANTHROPIC_API_KEY,
    googleApiKey: config.MAOF_GOOGLE_AI_API_KEY,
    defaultProvider: config.MAOF_DEFAULT_AI_PROVIDER,
  });
  const configured = getConfiguredProviders();
  if (configured.length > 0) {
    app.log.info({ providers: configured, dispatchMode: config.MAOF_AGENT_DISPATCH_MODE }, 'AI providers initialized');
  }

  // ── Routes ──────────────────────────────────────────────────────────────
  await app.register(healthRoutes);
  await app.register(authRoutes);
  await app.register(agentRoutes);
  if (process.env['MAOF_SKIP_DB'] !== 'true') {
    await app.register(workflowRoutes);
    await app.register(auditRoutes);
    await app.register(memoryRoutes);
    await app.register(teamRoutes);
    await app.register(kanbanRoutes);
    await app.register(messagingRoutes);
    await app.register(templateRoutes);
    await app.register(notificationRoutes);
    await app.register(builtinAgentRoutes);
    await app.register(analyticsRoutes);
    await app.register(agentOpsRoutes);
    await app.register(webhookRoutes);
    await app.register(metricsRoutes);
    await app.register(approvalRoutes);
    await app.register(a2aRoutes);

    // Phase 10: Enterprise features
    await app.register(agentMemoryRoutes);
    await app.register(conflictResolutionRoutes);
    await app.register(sandboxRoutes);
    await app.register(budgetRoutes);
    await app.register(agentPermissionRoutes);
    await app.register(agentVersionRoutes);
    await app.register(resultCacheRoutes);

    // Phase 9: Register webhook delivery handler for team events
    registerWebhookDelivery(async (teamUuid, eventType, payload) => {
      await deliverWebhookEvent(app.db, teamUuid, eventType, payload);
    });

    // Seed built-in workflow templates on startup
    try {
      const seeded = await seedTemplates(app.db);
      if (seeded > 0) {
        app.log.info({ count: seeded }, 'Seeded workflow templates');
      }
    } catch (err) {
      app.log.warn({ err }, 'Failed to seed workflow templates (table may not exist yet)');
    }

    // Seed built-in AI agents (Phase 4)
    try {
      const { created, updated } = await seedBuiltinAgents(app.db);
      if (created > 0 || updated > 0) {
        app.log.info({ created, updated }, 'Built-in AI agents seeded');
      }
    } catch (err) {
      app.log.warn({ err }, 'Failed to seed built-in agents (enum may need migration)');
    }
  }

  return app;
}
