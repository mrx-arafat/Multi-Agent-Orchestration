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
import {
  initHealthQueue,
  closeHealthQueue,
  createHealthWorker,
  scheduleHealthChecks,
} from '../queue/health-worker.js';

declare module 'fastify' {
  interface FastifyInstance {
    workflowQueue: Queue<WorkflowJobData>;
    workflowWorker: Worker<WorkflowJobData>;
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
  const worker: Worker<WorkflowJobData> = createWorkflowWorker(app.db, connection, app.redis);

  app.decorate('workflowQueue', queue);
  app.decorate('workflowWorker', worker);

  // Health check queue + worker (periodic agent health checks)
  const healthIntervalMs = config.MAOF_HEALTH_CHECK_INTERVAL_MS;
  let healthWorker: Worker | null = null;

  if (healthIntervalMs > 0) {
    const healthQueue = initHealthQueue(connection);
    healthWorker = createHealthWorker(app.db, connection);
    await scheduleHealthChecks(healthQueue, healthIntervalMs);
    app.log.info({ intervalMs: healthIntervalMs }, 'Agent health check scheduler started');
  }

  app.addHook('onClose', async () => {
    if (healthWorker) await healthWorker.close();
    await closeHealthQueue();
    await worker.close();
    await closeWorkflowQueue();
    app.log.info('BullMQ workers and queues closed');
  });

  app.log.info('BullMQ workflow queue initialized');
});
