/**
 * BullMQ workflow worker.
 * Processes workflow execution jobs sequentially through stages.
 * MVP: simulates agent work with 100ms delay + mock output.
 * Production: will dispatch to real agent endpoints.
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
 * Simulates an agent executing a stage (MVP placeholder).
 * Returns mock output based on the stage's capability.
 */
async function simulateAgentExecution(
  stage: StageDefinition,
  resolvedInput: unknown,
): Promise<Record<string, unknown>> {
  // Short delay to simulate real agent work
  await new Promise((resolve) => setTimeout(resolve, 50));

  return {
    capability: stage.agentCapability,
    stageId: stage.id,
    processedAt: new Date().toISOString(),
    input: resolvedInput,
    result: `Mock output from ${stage.agentCapability}`,
    status: 'success',
  };
}

/**
 * Creates and starts the BullMQ workflow worker.
 * Worker processes one workflow at a time in-process with the API server.
 */
export function createWorkflowWorker(
  db: Database,
  connection: ConnectionOptions,
): Worker<WorkflowJobData> {
  const worker = new Worker<WorkflowJobData>(
    WORKFLOW_QUEUE_NAME,
    async (job) => {
      const { workflowRunId } = job.data;

      // Fetch workflow run
      const [run] = await db
        .select()
        .from(workflowRuns)
        .where(eq(workflowRuns.workflowRunId, workflowRunId))
        .limit(1);

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

      // Execute stages in topological order
      const orderedStages = getExecutionOrder(definition.stages);

      for (const stage of orderedStages) {
        // Resolve variable interpolation for this stage's input
        const resolvedInput = resolveVariables(stage.input ?? {}, { workflowInput, stageOutputs });

        // Create stage execution record
        const [stageExec] = await db
          .insert(stageExecutions)
          .values({
            workflowRunId,
            stageId: stage.id,
            agentId: stage.agentCapability, // Using capability as agentId for MVP
            status: 'in_progress',
            input: resolvedInput as Record<string, unknown>,
            startedAt: new Date(),
          })
          .returning();

        if (!stageExec) throw new Error(`Failed to create stage execution for '${stage.id}'`);

        const startTime = Date.now();

        try {
          const output = await simulateAgentExecution(stage, resolvedInput);
          const executionTimeMs = Date.now() - startTime;

          // Update stage execution as completed
          await db
            .update(stageExecutions)
            .set({
              status: 'completed',
              output,
              completedAt: new Date(),
              executionTimeMs,
            })
            .where(eq(stageExecutions.id, stageExec.id));

          // Audit log: successful execution
          await logStageExecution(db, {
            workflowRunId,
            stageId: stage.id,
            agentId: stage.agentCapability,
            action: 'execute',
            input: resolvedInput,
            output,
            status: 'completed',
          });

          stageOutputs.set(stage.id, output);
        } catch (err) {
          await db
            .update(stageExecutions)
            .set({
              status: 'failed',
              errorMessage: err instanceof Error ? err.message : 'Stage execution failed',
              completedAt: new Date(),
            })
            .where(eq(stageExecutions.id, stageExec.id));

          // Audit log: failure
          await logStageExecution(db, {
            workflowRunId,
            stageId: stage.id,
            agentId: stage.agentCapability,
            action: 'fail',
            input: resolvedInput,
            status: 'failed',
          }).catch(() => {}); // Best-effort audit log on failure

          // Mark workflow as failed
          await db
            .update(workflowRuns)
            .set({
              status: 'failed',
              completedAt: new Date(),
              errorMessage: `Stage '${stage.id}' failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
            })
            .where(eq(workflowRuns.workflowRunId, workflowRunId));

          throw err;
        }
      }

      // All stages completed — mark workflow as completed
      const lastStage = orderedStages.at(-1);
      const finalOutput = lastStage ? stageOutputs.get(lastStage.id) : undefined;

      await db
        .update(workflowRuns)
        .set({
          status: 'completed',
          completedAt: new Date(),
        })
        .where(eq(workflowRuns.workflowRunId, workflowRunId));

      return { finalOutput };
    },
    {
      connection,
      concurrency: 1, // MVP: one workflow at a time to prevent duplicate execution
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`Workflow job ${job?.id} failed:`, err.message);
  });

  return worker;
}
