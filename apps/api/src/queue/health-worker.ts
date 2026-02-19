/**
 * BullMQ health check worker.
 * Runs periodic health checks against all registered agents.
 * Uses a repeatable job at configurable intervals (default: 5 min).
 */
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import type { Database } from '../db/index.js';
import { checkAllAgentsHealth } from '../modules/agents/health-checker.js';

export const HEALTH_QUEUE_NAME = 'agent-health-checks';

let healthQueue: Queue | null = null;

export function initHealthQueue(connection: ConnectionOptions): Queue {
  healthQueue = new Queue(HEALTH_QUEUE_NAME, { connection });
  return healthQueue;
}

export async function closeHealthQueue(): Promise<void> {
  if (healthQueue) {
    await healthQueue.close();
    healthQueue = null;
  }
}

/**
 * Schedules the repeatable health check job.
 * BullMQ handles deduplication — safe to call on every startup.
 */
export async function scheduleHealthChecks(
  queue: Queue,
  intervalMs: number,
): Promise<void> {
  // Remove any existing repeatable jobs to avoid stale intervals
  const existing = await queue.getRepeatableJobs();
  for (const job of existing) {
    await queue.removeRepeatableByKey(job.key);
  }

  await queue.add(
    'check-all-agents',
    {},
    {
      repeat: { every: intervalMs },
      removeOnComplete: 10,
      removeOnFail: 50,
    },
  );
}

/**
 * Creates and starts the BullMQ health check worker.
 */
export function createHealthWorker(
  db: Database,
  connection: ConnectionOptions,
  redis?: Redis,
): Worker {
  const worker = new Worker(
    HEALTH_QUEUE_NAME,
    async () => {
      const results = await checkAllAgentsHealth(db, 10000, redis);

      const statusChanges = results.filter((r) => r.previousStatus !== r.newStatus);

      if (statusChanges.length > 0 && process.env['MAOF_NODE_ENV'] !== 'test') {
        console.log(JSON.stringify({
          level: 'info',
          msg: 'Agent health check completed',
          total: results.length,
          statusChanges: statusChanges.map((r) => ({
            agentId: r.agentId,
            from: r.previousStatus,
            to: r.newStatus,
            error: r.error,
          })),
        }));
      }

      return { checked: results.length, changes: statusChanges.length };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('error', () => {
    // Prevent unhandled crash on Redis connection errors
  });

  return worker;
}
