import type { FastifyInstance } from 'fastify';
import {
  storeMemorySchema,
  recallMemorySchema,
  deleteMemorySchema,
  memorySummarySchema,
} from './schemas.js';
import {
  storeAgentMemory,
  recallAgentMemory,
  deleteAgentMemory,
  getMemorySummary,
} from './service.js';

export async function agentMemoryRoutes(app: FastifyInstance): Promise<void> {
  // Store a memory for an agent
  app.post(
    '/agents/:agentUuid/memory',
    { schema: storeMemorySchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const body = request.body as {
        memoryType: 'episodic' | 'semantic' | 'working';
        title: string;
        content: string;
        category?: string;
        importance?: number;
        metadata?: Record<string, unknown>;
        workflowRunId?: string;
        ttlSeconds?: number;
      };

      const memory = await storeAgentMemory(app.db, {
        agentUuid,
        ...body,
      });

      return reply.status(201).send({ success: true, data: memory });
    },
  );

  // Recall memories for an agent
  app.get(
    '/agents/:agentUuid/memory',
    { schema: recallMemorySchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const query = request.query as {
        memoryType?: 'episodic' | 'semantic' | 'working';
        category?: string;
        query?: string;
        limit?: number;
        minImportance?: number;
      };

      const memories = await recallAgentMemory(app.db, {
        agentUuid,
        ...query,
      });

      return reply.send({ success: true, data: { memories, count: memories.length } });
    },
  );

  // Delete a memory
  app.delete(
    '/agents/:agentUuid/memory/:memoryUuid',
    { schema: deleteMemorySchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid, memoryUuid } = request.params as {
        agentUuid: string;
        memoryUuid: string;
      };

      await deleteAgentMemory(app.db, memoryUuid, agentUuid);
      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  // Get memory summary for an agent
  app.get(
    '/agents/:agentUuid/memory/summary',
    { schema: memorySummarySchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const summary = await getMemorySummary(app.db, agentUuid);
      return reply.send({ success: true, data: summary });
    },
  );
}
