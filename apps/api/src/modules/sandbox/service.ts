/**
 * Sandbox/Staging service — dry-run and shadow mode for workflows.
 * Execute workflows without side effects or compare against production.
 */
import { eq, and } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { sandboxRuns, type NewSandboxRun } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import type { WorkflowDefinition, StageDefinition } from '../workflows/validator.js';
import { getExecutionLevels } from '../workflows/validator.js';

export interface DryRunParams {
  workflowDefinition: WorkflowDefinition;
  input?: Record<string, unknown> | undefined;
  createdByUserUuid: string;
  teamUuid?: string | undefined;
}

export interface ShadowRunParams {
  workflowRunId: string;
  workflowDefinition: WorkflowDefinition;
  input?: Record<string, unknown> | undefined;
  createdByUserUuid: string;
  teamUuid?: string | undefined;
}

interface SimulatedStageResult {
  stageId: string;
  capability: string;
  status: 'would_execute' | 'would_skip';
  dependencies: string[];
  estimatedCostCents: number;
  sideEffects: string[];
  input: unknown;
}

/**
 * Simulate stage execution without side effects.
 */
function simulateStage(
  stage: StageDefinition,
  resolvedInput: Record<string, unknown>,
  level: number,
): SimulatedStageResult {
  const sideEffects: string[] = [];

  // Detect potential side effects
  const inputStr = JSON.stringify(resolvedInput).toLowerCase();
  if (inputStr.includes('delete') || inputStr.includes('remove')) {
    sideEffects.push('Potential destructive operation detected');
  }
  if (inputStr.includes('http') || inputStr.includes('api')) {
    sideEffects.push('External API call would be made');
  }
  if (inputStr.includes('database') || inputStr.includes('db')) {
    sideEffects.push('Database modification would occur');
  }

  // Estimate cost (rough heuristic based on capability type)
  const costMap: Record<string, number> = {
    'code-audit': 15,
    'code-generation': 20,
    'research': 10,
    'text-generation': 8,
    'summarization': 5,
    'data-analysis': 12,
    'content-generation': 10,
  };
  const estimatedCostCents = costMap[stage.agentCapability] ?? 10;

  return {
    stageId: stage.id,
    capability: stage.agentCapability,
    status: 'would_execute',
    dependencies: stage.dependencies ?? [],
    estimatedCostCents,
    sideEffects,
    input: resolvedInput,
  };
}

/**
 * Execute a dry-run — simulates workflow without any side effects.
 */
export async function executeDryRun(
  db: Database,
  params: DryRunParams,
): Promise<typeof sandboxRuns.$inferSelect> {
  const { workflowDefinition, input } = params;

  // Create sandbox run record
  const [run] = await db.insert(sandboxRuns).values({
    mode: 'dry_run',
    workflowDefinition: workflowDefinition as unknown as Record<string, unknown>,
    input: input as unknown as Record<string, unknown> ?? null,
    createdByUserUuid: params.createdByUserUuid,
    teamUuid: params.teamUuid,
  }).returning();

  if (!run) throw ApiError.internal('Failed to create sandbox run');

  // Simulate execution
  const levels = getExecutionLevels(workflowDefinition.stages);
  const stageResults: SimulatedStageResult[] = [];
  const sideEffectsBlocked: string[] = [];
  let totalEstimatedCost = 0;
  const warnings: string[] = [];

  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const level = levels[levelIdx]!;
    for (const stage of level) {
      const stageInput = (stage.input ?? input ?? {}) as Record<string, unknown>;
      const result = simulateStage(stage, stageInput, levelIdx);
      stageResults.push(result);
      totalEstimatedCost += result.estimatedCostCents;
      if (result.sideEffects.length > 0) {
        sideEffectsBlocked.push(...result.sideEffects.map(e => `${stage.id}: ${e}`));
      }
    }
  }

  // Detect potential issues
  if (levels.length > 5) {
    warnings.push('Workflow has more than 5 dependency levels — consider simplifying');
  }
  if (totalEstimatedCost > 100) {
    warnings.push(`Estimated cost is high: ~$${(totalEstimatedCost / 100).toFixed(2)}`);
  }

  // Build simulated output
  const simulatedOutput = {
    totalStages: workflowDefinition.stages.length,
    parallelLevels: levels.length,
    estimatedTotalCostCents: totalEstimatedCost,
    executionOrder: levels.map((level, idx) => ({
      level: idx,
      stages: level.map(s => s.id),
      parallel: level.length > 1,
    })),
  };

  // Update sandbox run with results
  const [updated] = await db.update(sandboxRuns)
    .set({
      status: 'completed',
      simulatedOutput,
      stageResults,
      sideEffectsBlocked,
      estimatedCostCents: String(totalEstimatedCost),
      warnings,
      completedAt: new Date(),
    })
    .where(eq(sandboxRuns.id, run.id))
    .returning();

  return updated!;
}

/**
 * Execute a shadow run — runs alongside production for comparison.
 */
export async function executeShadowRun(
  db: Database,
  params: ShadowRunParams,
): Promise<typeof sandboxRuns.$inferSelect> {
  const [run] = await db.insert(sandboxRuns).values({
    mode: 'shadow',
    workflowRunId: params.workflowRunId,
    workflowDefinition: params.workflowDefinition as unknown as Record<string, unknown>,
    input: params.input as unknown as Record<string, unknown> ?? null,
    createdByUserUuid: params.createdByUserUuid,
    teamUuid: params.teamUuid,
  }).returning();

  if (!run) throw ApiError.internal('Failed to create shadow run');

  // Shadow mode simulates the same workflow to compare later
  const levels = getExecutionLevels(params.workflowDefinition.stages);
  const stageResults: SimulatedStageResult[] = [];
  let totalEstimatedCost = 0;

  for (let levelIdx = 0; levelIdx < levels.length; levelIdx++) {
    const level = levels[levelIdx]!;
    for (const stage of level) {
      const stageInput = (stage.input ?? params.input ?? {}) as Record<string, unknown>;
      const result = simulateStage(stage, stageInput, levelIdx);
      stageResults.push(result);
      totalEstimatedCost += result.estimatedCostCents;
    }
  }

  const [updated] = await db.update(sandboxRuns)
    .set({
      status: 'completed',
      stageResults,
      estimatedCostCents: String(totalEstimatedCost),
      completedAt: new Date(),
    })
    .where(eq(sandboxRuns.id, run.id))
    .returning();

  return updated!;
}

/**
 * Get sandbox run by UUID.
 */
export async function getSandboxRun(
  db: Database,
  sandboxUuid: string,
): Promise<typeof sandboxRuns.$inferSelect> {
  const [run] = await db.select().from(sandboxRuns)
    .where(eq(sandboxRuns.sandboxUuid, sandboxUuid))
    .limit(1);

  if (!run) throw ApiError.notFound('Sandbox run');
  return run;
}

/**
 * List sandbox runs for a user.
 */
export async function listSandboxRuns(
  db: Database,
  userUuid: string,
  mode?: 'dry_run' | 'shadow' | 'isolated',
): Promise<typeof sandboxRuns.$inferSelect[]> {
  const conditions = [eq(sandboxRuns.createdByUserUuid, userUuid)];
  if (mode) conditions.push(eq(sandboxRuns.mode, mode));

  return db.select().from(sandboxRuns)
    .where(and(...conditions))
    .orderBy(sandboxRuns.createdAt)
    .limit(50);
}
