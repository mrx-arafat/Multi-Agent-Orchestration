/**
 * Workflow service — creates and tracks workflow runs.
 */
import { eq, and, sql, desc } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import type { Database } from '../../db/index.js';
import { workflowRuns, stageExecutions } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import type { WorkflowDefinition } from './validator.js';

export interface WorkflowRunSummary {
  workflowRunId: string;
  workflowName: string;
  status: string;
  progress: {
    total: number;
    completed: number;
    failed: number;
    inProgress: number;
    current: string | null;
    currentStages: string[];
  };
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
}

export interface WorkflowListResult {
  runs: {
    workflowRunId: string;
    workflowName: string;
    status: string;
    createdAt: Date;
    completedAt: Date | null;
  }[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export async function listWorkflowRuns(
  db: Database,
  userUuid: string,
  params: { status?: string; page?: number; limit?: number },
): Promise<WorkflowListResult> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [eq(workflowRuns.userUuid, userUuid)];
  if (params.status) {
    conditions.push(eq(workflowRuns.status, params.status as 'queued' | 'in_progress' | 'completed' | 'failed'));
  }

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db
      .select({
        workflowRunId: workflowRuns.workflowRunId,
        workflowName: workflowRuns.workflowName,
        status: workflowRuns.status,
        createdAt: workflowRuns.createdAt,
        completedAt: workflowRuns.completedAt,
      })
      .from(workflowRuns)
      .where(whereClause)
      .orderBy(desc(workflowRuns.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(workflowRuns)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    runs: rows.map((r) => ({
      workflowRunId: r.workflowRunId,
      workflowName: r.workflowName,
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt ?? null,
    })),
    meta: { total, page, limit, pages: Math.ceil(total / limit) },
  };
}

export async function createWorkflowRun(
  db: Database,
  params: {
    definition: WorkflowDefinition;
    input: Record<string, unknown>;
    userUuid: string;
  },
): Promise<{ workflowRunId: string; status: string }> {
  const workflowRunId = `wfr-${randomUUID()}`;

  await db.insert(workflowRuns).values({
    workflowRunId,
    userUuid: params.userUuid,
    workflowName: params.definition.name,
    workflowDefinition: params.definition as unknown as Record<string, unknown>,
    input: params.input,
    status: 'queued',
  });

  return { workflowRunId, status: 'queued' };
}

export async function getWorkflowStatus(
  db: Database,
  workflowRunId: string,
  requestingUserUuid: string,
  requestingUserRole = 'user',
): Promise<WorkflowRunSummary> {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowRunId, workflowRunId))
    .limit(1);

  if (!run) {
    throw ApiError.notFound('Workflow run');
  }

  // Admin can access any workflow; regular users only their own
  if (requestingUserRole !== 'admin' && run.userUuid !== requestingUserUuid) {
    throw ApiError.forbidden('Access denied');
  }

  // Get stage progress
  const stageStats = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'completed')::int`,
      failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      inProgress: sql<number>`count(*) filter (where status = 'in_progress')::int`,
    })
    .from(stageExecutions)
    .where(eq(stageExecutions.workflowRunId, workflowRunId));

  const stats = stageStats[0] ?? { total: 0, completed: 0, failed: 0, inProgress: 0 };

  // Find all currently executing stages (supports parallel execution)
  const currentStages = await db
    .select({ stageId: stageExecutions.stageId })
    .from(stageExecutions)
    .where(
      and(
        eq(stageExecutions.workflowRunId, workflowRunId),
        eq(stageExecutions.status, 'in_progress'),
      ),
    );

  const currentStageIds = currentStages.map((s) => s.stageId);

  return {
    workflowRunId: run.workflowRunId,
    workflowName: run.workflowName,
    status: run.status,
    progress: {
      total: stats.total,
      completed: stats.completed,
      failed: stats.failed,
      inProgress: stats.inProgress,
      current: currentStageIds[0] ?? null,
      currentStages: currentStageIds,
    },
    createdAt: run.createdAt,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
    errorMessage: run.errorMessage ?? null,
  };
}

export async function getWorkflowResult(
  db: Database,
  workflowRunId: string,
  requestingUserUuid: string,
  requestingUserRole = 'user',
): Promise<{ workflowRunId: string; output: unknown }> {
  const [run] = await db
    .select()
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowRunId, workflowRunId))
    .limit(1);

  if (!run) {
    throw ApiError.notFound('Workflow run');
  }

  // Admin can access any workflow; regular users only their own
  if (requestingUserRole !== 'admin' && run.userUuid !== requestingUserUuid) {
    throw ApiError.forbidden('Access denied');
  }

  if (run.status !== 'completed') {
    throw ApiError.notFound('Workflow result not available yet');
  }

  // Get output from last completed stage
  const [lastStage] = await db
    .select({ output: stageExecutions.output })
    .from(stageExecutions)
    .where(
      and(
        eq(stageExecutions.workflowRunId, workflowRunId),
        eq(stageExecutions.status, 'completed'),
      ),
    )
    .orderBy(sql`completed_at DESC`)
    .limit(1);

  return {
    workflowRunId,
    output: lastStage?.output ?? null,
  };
}
