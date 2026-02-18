/**
 * BullMQ queue definition for workflow execution.
 * BullMQ manages its own Redis connections — pass connection options, not an IORedis instance.
 */
import { Queue } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';

export const WORKFLOW_QUEUE_NAME = 'workflow-execution';

export interface WorkflowJobData {
  workflowRunId: string;
  userUuid: string;
}

let _queue: Queue<WorkflowJobData> | null = null;

export function getWorkflowQueue(): Queue<WorkflowJobData> {
  if (!_queue) {
    throw new Error('Workflow queue not initialized. Call initWorkflowQueue() first.');
  }
  return _queue;
}

export function initWorkflowQueue(connection: ConnectionOptions): Queue<WorkflowJobData> {
  if (_queue) return _queue;

  _queue = new Queue<WorkflowJobData>(WORKFLOW_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 50 },
    },
  });

  return _queue;
}

export async function closeWorkflowQueue(): Promise<void> {
  if (_queue) {
    await _queue.close();
    _queue = null;
  }
}
