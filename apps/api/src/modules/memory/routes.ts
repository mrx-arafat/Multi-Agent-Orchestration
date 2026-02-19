/**
 * Memory store routes (SRS FR-3.3).
 * POST   /memory/:workflowRunId          — write key-value pair
 * GET    /memory/:workflowRunId/:key      — read value by key
 * DELETE /memory/:workflowRunId/:key      — delete key
 * GET    /memory/:workflowRunId           — list all keys
 *
 * All routes require JWT authentication.
 */
import type { FastifyInstance } from 'fastify';
import { writeMemory, readMemory, deleteMemory, listMemoryKeys } from './service.js';
import { writeMemorySchema, readMemorySchema, listMemorySchema } from './schemas.js';

export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /memory/:workflowRunId
   * Body: { key, value, ttlSeconds? }
   */
  app.post(
    '/memory/:workflowRunId',
    { schema: writeMemorySchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { workflowRunId } = request.params as { workflowRunId: string };
      const { key, value, ttlSeconds } = request.body as {
        key: string;
        value: unknown;
        ttlSeconds?: number;
      };

      const params: import('./service.js').MemoryWriteParams = { workflowRunId, key, value };
      if (ttlSeconds !== undefined) params.ttlSeconds = ttlSeconds;
      await writeMemory(app.redis, params);

      return reply.status(201).send({
        success: true,
        data: { workflowRunId, key, ttlSeconds: ttlSeconds ?? 86400 },
      });
    },
  );

  /**
   * GET /memory/:workflowRunId/:key
   */
  app.get(
    '/memory/:workflowRunId/:key',
    { schema: readMemorySchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { workflowRunId, key } = request.params as { workflowRunId: string; key: string };

      const value = await readMemory(app.redis, workflowRunId, key);

      if (value === null) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: `Key '${key}' not found` },
        });
      }

      return reply.send({ success: true, data: { key, value } });
    },
  );

  /**
   * DELETE /memory/:workflowRunId/:key
   */
  app.delete(
    '/memory/:workflowRunId/:key',
    { schema: readMemorySchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { workflowRunId, key } = request.params as { workflowRunId: string; key: string };

      const deleted = await deleteMemory(app.redis, workflowRunId, key);

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: { code: 'NOT_FOUND', message: `Key '${key}' not found` },
        });
      }

      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  /**
   * GET /memory/:workflowRunId
   * Lists all keys in the memory store for a workflow run.
   */
  app.get(
    '/memory/:workflowRunId',
    { schema: listMemorySchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { workflowRunId } = request.params as { workflowRunId: string };

      const keys = await listMemoryKeys(app.redis, workflowRunId);

      return reply.send({ success: true, data: { workflowRunId, keys, count: keys.length } });
    },
  );
}
