/**
 * Built-in agents API routes.
 * Provides info about AI provider status and built-in capabilities.
 */
import { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { getConfiguredProviders, hasAnyProvider } from '../../lib/ai-providers/index.js';
import { listBuiltinCapabilities } from './capability-prompts.js';
import { getConfig } from '../../config/index.js';

async function routes(app: FastifyInstance): Promise<void> {
  /**
   * GET /ai/status — AI provider status and capabilities.
   * Requires authentication.
   */
  app.get('/ai/status', {
    onRequest: [app.authenticate],
    handler: async (_req, reply) => {
      const config = getConfig();
      const providers = getConfiguredProviders();

      return reply.send({
        success: true,
        data: {
          dispatchMode: config.MAOF_AGENT_DISPATCH_MODE,
          providers: providers.map((p) => ({
            name: p,
            configured: true,
          })),
          hasAnyProvider: hasAnyProvider(),
          defaultProvider: config.MAOF_DEFAULT_AI_PROVIDER ?? (providers[0] || null),
          capabilities: listBuiltinCapabilities(),
          builtinReady: config.MAOF_AGENT_DISPATCH_MODE === 'builtin' && hasAnyProvider(),
        },
      });
    },
  });
}

export const builtinAgentRoutes = fp(routes, {
  name: 'builtin-agent-routes',
});
