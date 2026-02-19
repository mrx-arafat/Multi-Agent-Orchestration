/**
 * BullMQ workflow worker.
 * Processes workflow execution jobs by routing stages to real agents
 * or using mock simulation based on MAOF_AGENT_DISPATCH_MODE.
 */
import { Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/index.js';
import { workflowRuns, stageExecutions } from '../db/schema/index.js';
import { getExecutionOrder } from '../modules/workflows/validator.js';
import type { WorkflowDefinition, StageDefinition } from '../modules/workflows/validator.js';
import { WORKFLOW_QUEUE_NAME, type WorkflowJobData } from './workflow-queue.js';
import { logStageExecution } from '../modules/audit/service.js';
import { findAgentForCapability } from '../modules/agents/router.js';
import { getAgentAuthToken } from '../modules/agents/service.js';
import { callAgent, AgentCallError, type AgentRequest } from '../lib/agent-client.js';
import { getConfig } from '../config/index.js';
import type { Redis } from 'ioredis';
import { incrementAgentTasks, decrementAgentTasks } from '../modules/agents/task-tracker.js';
import { writeMemory } from '../modules/memory/service.js';
import { cacheStageOutput } from '../lib/cache.js';

/**
 * Resolves variable interpolation: ${stageId.output.field} or ${workflow.input.field}
 */
function resolveVariables(
  value: unknown,
  context: { workflowInput: Record<string, unknown>; stageOutputs: Map<string, unknown> },
): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([^}]+)\}/g, (match, path: string) => {
      const parts = path.split('.');
      const p0 = parts[0] ?? '';
      const p1 = parts[1] ?? '';
      const p2 = parts[2] ?? '';
      if (p0 === 'workflow' && p1 === 'input') {
        return String(context.workflowInput[p2] ?? '');
      }
      if (p1 === 'output' && context.stageOutputs.has(p0)) {
        const output = context.stageOutputs.get(p0) as Record<string, unknown>;
        return String(output?.[p2] ?? '');
      }
      return match;
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => resolveVariables(v, context));
  }
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = resolveVariables(v, context);
    }
    return result;
  }
  return value;
}

/**
 * Mock agent execution (for development/testing).
 */
async function simulateAgentExecution(
  stage: StageDefinition,
  resolvedInput: unknown,
): Promise<{ output: Record<string, unknown>; agentId: string }> {
  await new Promise((resolve) => setTimeout(resolve, 50));

  return {
    agentId: `mock-${stage.agentCapability}`,
    output: {
      capability: stage.agentCapability,
      stageId: stage.id,
      processedAt: new Date().toISOString(),
      input: resolvedInput,
      result: `Mock output from ${stage.agentCapability}`,
      status: 'success',
    },
  };
}

/**
 * Real agent dispatch — routes to an actual agent via HTTP.
 */
async function dispatchToAgent(
  db: Database,
  stage: StageDefinition,
  resolvedInput: Record<string, unknown>,
  workflowRunId: string,
  userUuid: string,
  completedStageIds: string[],
  timeoutMs: number,
): Promise<{ output: Record<string, unknown>; agentId: string }> {
  const agent = await findAgentForCapability(db, stage.agentCapability);

  if (!agent) {
    throw new AgentCallError(
      `No online agent available with capability '${stage.agentCapability}'`,
      'NO_AGENT_AVAILABLE',
      false,
      stage.agentCapability,
    );
  }

  const authToken = await getAgentAuthToken(db, agent.agentUuid);

  const request: AgentRequest = {
    workflow_run_id: workflowRunId,
    stage_id: stage.id,
    capability_required: stage.agentCapability,
    input: resolvedInput,
    context: {
      previous_stages: completedStageIds,
      user_id: userUuid,
      deadline_ms: timeoutMs,
    },
  };

  const response = await callAgent(agent.endpoint, authToken, request, timeoutMs);

  return {
    agentId: agent.agentId,
    output: response.output,
  };
}

/**
 * Sleeps for the given milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a single stage — dispatches to real agent or mock based on config.
 */
async function executeStage(
  db: Database,
  stage: StageDefinition,
  resolvedInput: Record<string, unknown>,
  workflowRunId: string,
  userUuid: string,
  completedStageIds: string[],
): Promise<{ output: Record<string, unknown>; agentId: string }> {
  const config = getConfig();

  if (config.MAOF_AGENT_DISPATCH_MODE === 'real') {
    return dispatchToAgent(
      db, stage, resolvedInput, workflowRunId, userUuid, completedStageIds,
      config.MAOF_AGENT_CALL_TIMEOUT_MS,
    );
  }

  return simulateAgentExecution(stage, resolvedInput);
}

/**
 * Executes a stage with retry logic and fallback to alternate agents.
 *
 * Retry strategy:
 * 1. Try the primary agent up to maxRetries times with exponential backoff.
 * 2. If all retries exhausted and error was retryable, try a fallback agent (different agent same capability).
 * 3. Fallback agent also gets full retry budget.
 * 4. Fail only when all agents and retries are exhausted.
 */
export async function executeStageWithRetry(
  db: Database,
  stage: StageDefinition,
  resolvedInput: Record<string, unknown>,
  workflowRunId: string,
  userUuid: string,
  completedStageIds: string[],
  redis?: Redis,
): Promise<{ output: Record<string, unknown>; agentId: string; memoryWrites?: Record<string, unknown> }> {
  const config = getConfig();

  // Mock mode skips retry logic entirely
  if (config.MAOF_AGENT_DISPATCH_MODE !== 'real') {
    return simulateAgentExecution(stage, resolvedInput);
  }

  const maxRetries = stage.retryConfig?.maxRetries ?? 2;
  const backoffMs = stage.retryConfig?.backoffMs ?? 1000;
  const timeoutMs = stage.retryConfig?.timeoutMs ?? config.MAOF_AGENT_CALL_TIMEOUT_MS;
  const failedAgentUuids: string[] = [];
  let lastError: Error | null = null;

  // Attempt with up to 2 different agents (primary + 1 fallback)
  const maxAgentAttempts = 2;

  for (let agentAttempt = 0; agentAttempt < maxAgentAttempts; agentAttempt++) {
    const agent = await findAgentForCapability(db, stage.agentCapability, failedAgentUuids, redis);

    if (!agent) {
      // No more agents available for this capability
      if (lastError) throw lastError;
      throw new AgentCallError(
        `No online agent available with capability '${stage.agentCapability}'`,
        'NO_AGENT_AVAILABLE',
        false,
        stage.agentCapability,
      );
    }

    // Track concurrent tasks in Redis
    if (redis) await incrementAgentTasks(redis, agent.agentUuid);

    const authToken = await getAgentAuthToken(db, agent.agentUuid);

    try {
      for (let retry = 0; retry <= maxRetries; retry++) {
        try {
          const request: AgentRequest = {
            workflow_run_id: workflowRunId,
            stage_id: stage.id,
            capability_required: stage.agentCapability,
            input: resolvedInput,
            context: {
              previous_stages: completedStageIds,
              user_id: userUuid,
              deadline_ms: timeoutMs,
            },
          };

          const response = await callAgent(agent.endpoint, authToken, request, timeoutMs);
          const result: { output: Record<string, unknown>; agentId: string; memoryWrites?: Record<string, unknown> } = {
            agentId: agent.agentId,
            output: response.output,
          };
          if (response.memory_writes) result.memoryWrites = response.memory_writes;
          return result;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const isRetryable = err instanceof AgentCallError && err.retryable;

          if (retry < maxRetries && isRetryable) {
            // Log retry attempt
            const delay = backoffMs * Math.pow(2, retry);
            await logStageExecution(db, {
              workflowRunId,
              stageId: stage.id,
              agentId: agent.agentId,
              action: 'retry',
              input: resolvedInput,
              status: `retry_${retry + 1}_of_${maxRetries}`,
            }).catch(() => {}); // Best-effort audit

            await sleep(delay);
            continue;
          }

          // Retries exhausted or non-retryable — try fallback agent
          if (!isRetryable) {
            // Non-retryable errors don't benefit from a fallback agent
            throw lastError;
          }

          // Mark this agent as failed so fallback selects a different one
          failedAgentUuids.push(agent.agentUuid);
          break; // Break retry loop, continue agent loop
        }
      }
    } finally {
      // Always decrement task count when done with this agent
      if (redis) await decrementAgentTasks(redis, agent.agentUuid).catch(() => {});
    }
  }

  // All agents and retries exhausted
  throw lastError ?? new AgentCallError(
    `All agents exhausted for capability '${stage.agentCapability}'`,
    'ALL_AGENTS_EXHAUSTED',
    false,
    stage.agentCapability,
  );
}

/**
 * Creates and starts the BullMQ workflow worker.
 */
export function createWorkflowWorker(
  db: Database,
  connection: ConnectionOptions,
  redis?: Redis,
): Worker<WorkflowJobData> {
  const worker = new Worker<WorkflowJobData>(
    WORKFLOW_QUEUE_NAME,
    async (job) => {
      const { workflowRunId, userUuid } = job.data;

      // Fetch workflow run with retry — BullMQ may pick up the job before the INSERT
      // is visible on all pool connections (connection pool visibility delay)
      let run: typeof workflowRuns.$inferSelect | undefined;
      for (let attempt = 0; attempt < 5; attempt++) {
        [run] = await db
          .select()
          .from(workflowRuns)
          .where(eq(workflowRuns.workflowRunId, workflowRunId))
          .limit(1);
        if (run) break;
        await sleep(200 * (attempt + 1));
      }

      if (!run) {
        throw new Error(`Workflow run '${workflowRunId}' not found`);
      }

      // Mark as in_progress
      await db
        .update(workflowRuns)
        .set({ status: 'in_progress', startedAt: new Date() })
        .where(eq(workflowRuns.workflowRunId, workflowRunId));

      const definition = run.workflowDefinition as unknown as WorkflowDefinition;
      const workflowInput = (run.input ?? {}) as Record<string, unknown>;
      const stageOutputs = new Map<string, unknown>();
      const completedStageIds: string[] = [];

      // Execute stages in topological order
      const orderedStages = getExecutionOrder(definition.stages);

      for (const stage of orderedStages) {
        const resolvedInput = resolveVariables(stage.input ?? {}, { workflowInput, stageOutputs }) as Record<string, unknown>;

        // Create stage execution record
        const [stageExec] = await db
          .insert(stageExecutions)
          .values({
            workflowRunId,
            stageId: stage.id,
            agentId: stage.agentCapability, // Updated after dispatch
            status: 'in_progress',
            input: resolvedInput,
            startedAt: new Date(),
          })
          .returning();

        if (!stageExec) throw new Error(`Failed to create stage execution for '${stage.id}'`);

        const startTime = Date.now();

        try {
          const { output, agentId, memoryWrites } = await executeStageWithRetry(
            db, stage, resolvedInput, workflowRunId, userUuid, completedStageIds, redis,
          );
          const executionTimeMs = Date.now() - startTime;

          // Persist agent memory_writes to Redis (SRS FR-3.3)
          if (memoryWrites && redis) {
            for (const [key, value] of Object.entries(memoryWrites)) {
              await writeMemory(redis, { workflowRunId, key, value }).catch(() => {});
            }
          }

          // Update stage execution as completed with actual agent ID
          await db
            .update(stageExecutions)
            .set({
              status: 'completed',
              output,
              agentId,
              completedAt: new Date(),
              executionTimeMs,
            })
            .where(eq(stageExecutions.id, stageExec.id));

          // Audit log
          await logStageExecution(db, {
            workflowRunId,
            stageId: stage.id,
            agentId,
            action: 'execute',
            input: resolvedInput,
            output,
            status: 'completed',
          });

          // Cache stage output in Redis for fast context lookups (Phase 2)
          if (redis) {
            await cacheStageOutput(redis, workflowRunId, stage.id, output).catch(() => {});
          }

          stageOutputs.set(stage.id, output);
          completedStageIds.push(stage.id);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Stage execution failed';
          const agentId = err instanceof AgentCallError ? err.agentId : stage.agentCapability;

          await db
            .update(stageExecutions)
            .set({
              status: 'failed',
              agentId,
              errorMessage,
              completedAt: new Date(),
              executionTimeMs: Date.now() - startTime,
            })
            .where(eq(stageExecutions.id, stageExec.id));

          // Audit log: failure
          await logStageExecution(db, {
            workflowRunId,
            stageId: stage.id,
            agentId,
            action: 'fail',
            input: resolvedInput,
            status: 'failed',
          }).catch(() => {}); // Best-effort

          // Mark workflow as failed
          await db
            .update(workflowRuns)
            .set({
              status: 'failed',
              completedAt: new Date(),
              errorMessage: `Stage '${stage.id}' failed: ${errorMessage}`,
            })
            .where(eq(workflowRuns.workflowRunId, workflowRunId));

          throw err;
        }
      }

      // All stages completed
      await db
        .update(workflowRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(workflowRuns.workflowRunId, workflowRunId));

      const lastStage = orderedStages.at(-1);
      return { finalOutput: lastStage ? stageOutputs.get(lastStage.id) : undefined };
    },
    {
      connection,
      concurrency: 1,
    },
  );

  worker.on('failed', (job, err) => {
    const meta = { jobId: job?.id, workflowRunId: job?.data?.workflowRunId };
    if (process.env['MAOF_NODE_ENV'] !== 'test') {
      console.error(JSON.stringify({ level: 'error', msg: 'Workflow job failed', err: err.message, ...meta }));
    }
  });

  worker.on('error', () => {
    // BullMQ emits connection errors here — prevent unhandled crashes.
  });

  return worker;
}
