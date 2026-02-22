/**
 * Task Timeout Checker — detects and handles stale in_progress tasks.
 *
 * Tasks with a `timeoutMs` that have been in_progress longer than their
 * timeout are automatically failed and re-queued (if retries remain).
 * Called periodically by the health check worker.
 */
import { and, sql, isNotNull } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { kanbanTasks } from '../../db/schema/index.js';
import { emitTeamEvent } from '../../lib/event-bus.js';

export interface TimeoutResult {
  timedOutCount: number;
  retriedCount: number;
  deadLetterCount: number;
}

/**
 * Checks for tasks that have exceeded their timeout and handles them.
 */
export async function checkTaskTimeouts(db: Database): Promise<TimeoutResult> {
  // Find in_progress tasks with a timeout that have exceeded it
  const staleTasks = await db
    .select()
    .from(kanbanTasks)
    .where(and(
      sql`${kanbanTasks.status} = 'in_progress'`,
      isNotNull(kanbanTasks.timeoutMs),
      isNotNull(kanbanTasks.startedAt),
      sql`${kanbanTasks.startedAt} + (${kanbanTasks.timeoutMs} || ' milliseconds')::interval < NOW()`,
    ))
    .limit(100);

  let retriedCount = 0;
  let deadLetterCount = 0;

  for (const task of staleTasks) {
    const newRetryCount = task.retryCount + 1;
    const canRetry = newRetryCount <= task.maxRetries;

    const updateValues: Record<string, unknown> = {
      assignedAgentUuid: null,
      retryCount: newRetryCount,
      lastError: `Timed out after ${task.timeoutMs}ms`,
      updatedAt: new Date(),
      progressCurrent: null,
      progressTotal: null,
      progressMessage: null,
    };

    if (canRetry) {
      updateValues.status = 'todo';
      updateValues.result = `TIMEOUT (retry ${newRetryCount}/${task.maxRetries})`;
      retriedCount++;
    } else {
      updateValues.status = 'done';
      updateValues.result = `TIMEOUT FAILED (${newRetryCount} attempts exhausted)`;
      updateValues.completedAt = new Date();
      deadLetterCount++;
    }

    await db
      .update(kanbanTasks)
      .set(updateValues)
      .where(sql`${kanbanTasks.taskUuid} = ${task.taskUuid}`);

    emitTeamEvent(task.teamUuid, canRetry ? 'task:timeout_retry' : 'task:timeout_dead_letter', {
      taskUuid: task.taskUuid,
      agentUuid: task.assignedAgentUuid,
      timeoutMs: task.timeoutMs,
      retryCount: newRetryCount,
      maxRetries: task.maxRetries,
    });
  }

  return {
    timedOutCount: staleTasks.length,
    retriedCount,
    deadLetterCount,
  };
}
