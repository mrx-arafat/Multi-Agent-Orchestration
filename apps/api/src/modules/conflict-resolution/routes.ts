import type { FastifyInstance } from 'fastify';
import {
  acquireLockSchema,
  releaseLockSchema,
  checkLockSchema,
  detectConflictSchema,
} from './schemas.js';
import {
  acquireLock,
  releaseLock,
  checkLock,
  detectConflict,
  listActiveLocks,
} from './service.js';

export async function conflictResolutionRoutes(app: FastifyInstance): Promise<void> {
  // Acquire a resource lock
  app.post(
    '/locks/acquire',
    { schema: acquireLockSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = request.body as {
        resourceType: string;
        resourceId: string;
        ownerAgentUuid: string;
        ownerWorkflowRunId?: string;
        conflictStrategy?: 'fail' | 'queue' | 'merge' | 'escalate';
        timeoutSeconds?: number;
        contentHash?: string;
        metadata?: Record<string, unknown>;
      };

      const lock = await acquireLock(app.db, body);
      return reply.status(201).send({ success: true, data: lock });
    },
  );

  // Release a resource lock
  app.post(
    '/locks/:lockUuid/release',
    { schema: releaseLockSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { lockUuid } = request.params as { lockUuid: string };
      const { ownerAgentUuid } = request.body as { ownerAgentUuid: string };

      await releaseLock(app.db, { lockUuid, ownerAgentUuid });
      return reply.send({ success: true, data: { released: true } });
    },
  );

  // Check if a resource is locked
  app.get(
    '/locks/check',
    { schema: checkLockSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { resourceType, resourceId } = request.query as {
        resourceType: string;
        resourceId: string;
      };

      const lock = await checkLock(app.db, resourceType, resourceId);
      return reply.send({
        success: true,
        data: { locked: lock !== null, lock },
      });
    },
  );

  // Detect conflict via content hash
  app.post(
    '/locks/:lockUuid/detect-conflict',
    { schema: detectConflictSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { lockUuid } = request.params as { lockUuid: string };
      const { currentContentHash } = request.body as { currentContentHash: string };

      const result = await detectConflict(app.db, lockUuid, currentContentHash);
      return reply.send({ success: true, data: result });
    },
  );

  // List all active locks
  app.get(
    '/locks',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const locks = await listActiveLocks(app.db);
      return reply.send({ success: true, data: { locks, count: locks.length } });
    },
  );
}
