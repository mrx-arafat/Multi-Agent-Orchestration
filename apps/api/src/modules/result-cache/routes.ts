import type { FastifyInstance } from 'fastify';
import {
  getCacheSchema,
  setCacheSchema,
  invalidateSchema,
  warmCacheSchema,
} from './schemas.js';
import {
  getCachedResult,
  cacheResult,
  invalidateCacheEntry,
  invalidateCapabilityCache,
  invalidateAllCache,
  getCacheStats,
  warmCache,
} from './service.js';

export async function resultCacheRoutes(app: FastifyInstance): Promise<void> {
  // Check cache for a result
  app.get(
    '/cache/lookup',
    { schema: getCacheSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { capability, input: inputStr } = request.query as {
        capability: string;
        input?: string;
      };

      let input: Record<string, unknown> = {};
      if (inputStr) {
        try {
          input = JSON.parse(inputStr);
        } catch {
          input = {};
        }
      }

      const cached = await getCachedResult(app.redis, capability, input);

      if (cached) {
        return reply.send({ success: true, data: { hit: true, entry: cached } });
      }
      return reply.send({ success: true, data: { hit: false, entry: null } });
    },
  );

  // Store a result in cache
  app.post(
    '/cache',
    { schema: setCacheSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { capability, input, output, agentId, ttlSeconds } = request.body as {
        capability: string;
        input: Record<string, unknown>;
        output: Record<string, unknown>;
        agentId: string;
        ttlSeconds?: number;
      };

      const key = await cacheResult(app.redis, capability, input, output, agentId, ttlSeconds);
      return reply.status(201).send({ success: true, data: { cached: true, key } });
    },
  );

  // Invalidate cache entries
  app.post(
    '/cache/invalidate',
    { schema: invalidateSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { capability, input } = request.body as {
        capability?: string;
        input?: Record<string, unknown>;
      };

      let count = 0;
      if (capability && input) {
        const deleted = await invalidateCacheEntry(app.redis, capability, input);
        count = deleted ? 1 : 0;
      } else if (capability) {
        count = await invalidateCapabilityCache(app.redis, capability);
      } else {
        count = await invalidateAllCache(app.redis);
      }

      return reply.send({ success: true, data: { invalidated: count } });
    },
  );

  // Get cache statistics
  app.get(
    '/cache/stats',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const stats = await getCacheStats(app.redis);
      return reply.send({ success: true, data: stats });
    },
  );

  // Warm cache with pre-computed results
  app.post(
    '/cache/warm',
    { schema: warmCacheSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { entries } = request.body as {
        entries: Array<{
          capability: string;
          input: Record<string, unknown>;
          output: Record<string, unknown>;
          agentId: string;
          ttlSeconds?: number;
        }>;
      };

      const warmed = await warmCache(app.redis, entries);
      return reply.status(201).send({ success: true, data: { warmed } });
    },
  );
}
