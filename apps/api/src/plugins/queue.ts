/**
 * BullMQ queue plugin.
 * Initializes the workflow queue and worker using Redis connection config.
 * BullMQ manages its own Redis connections — separate from the IORedis app.redis instance.
 */
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { Queue } from 'bullmq';
import type { Worker } from 'bullmq';
import { getConfig } from '../config/index.js';
import {
  initWorkflowQueue,
  closeWorkflowQueue,
  type WorkflowJobData,
} from '../queue/workflow-queue.js';
import { createWorkflowWorker } from '../queue/workflow-worker.js';

declare module 'fastify' {
  interface FastifyInstance {
    workflowQueue: Queue<WorkflowJobData>;
  }
}

export const queuePlugin = fp(async function (app: FastifyInstance): Promise<void> {
  const config = getConfig();

  // BullMQ connection options — separate from app.redis (which uses lazyConnect)
  const connection = {
    host: config.MAOF_REDIS_HOST,
    port: config.MAOF_REDIS_PORT,
    password: config.MAOF_REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null, // Required for BullMQ blocking commands
    enableReadyCheck: false,    // BullMQ handles its own ready state
  };

  const queue = initWorkflowQueue(connection);
  const worker: Worker<WorkflowJobData> = createWorkflowWorker(app.db, connection);

  app.decorate('workflowQueue', queue);

  app.addHook('onClose', async () => {
    await worker.close();
    await closeWorkflowQueue();
    app.log.info('BullMQ worker and queue closed');
  });

  app.log.info('BullMQ workflow queue initialized');
});
