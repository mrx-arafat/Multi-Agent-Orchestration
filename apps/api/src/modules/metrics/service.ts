/**
 * Task Metrics Service — records and queries cost, token usage, and latency
 * per task execution. Provides observability into agent spending.
 */
import { eq, and, sql, desc } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { taskMetrics } from '../../db/schema/index.js';

export interface RecordMetricParams {
  taskUuid?: string;
  workflowRunId?: string;
  stageId?: string;
  agentUuid?: string;
  agentId?: string;
  teamUuid?: string;
  tokensUsed?: number;
  promptTokens?: number;
  completionTokens?: number;
  costCents?: number;
  latencyMs?: number;
  queueWaitMs?: number;
  provider?: string;
  model?: string;
  capability?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Records a task execution metric.
 */
export async function recordMetric(
  db: Database,
  params: RecordMetricParams,
): Promise<{ metricUuid: string }> {
  const [created] = await db
    .insert(taskMetrics)
    .values({
      taskUuid: params.taskUuid,
      workflowRunId: params.workflowRunId,
      stageId: params.stageId,
      agentUuid: params.agentUuid,
      agentId: params.agentId,
      teamUuid: params.teamUuid,
      tokensUsed: params.tokensUsed ?? 0,
      promptTokens: params.promptTokens ?? 0,
      completionTokens: params.completionTokens ?? 0,
      costCents: params.costCents ?? 0,
      latencyMs: params.latencyMs ?? 0,
      queueWaitMs: params.queueWaitMs,
      provider: params.provider,
      model: params.model,
      capability: params.capability,
      metadata: params.metadata,
    })
    .returning({ metricUuid: taskMetrics.metricUuid });

  if (!created) throw new Error('Failed to record metric');
  return { metricUuid: created.metricUuid };
}

// ── Aggregation Queries ─────────────────────────────────────────────────

export interface CostSummary {
  totalCostCents: number;
  totalTokens: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  avgLatencyMs: number;
  executionCount: number;
}

/**
 * Gets cost summary for a team within a date range.
 */
export async function getTeamCostSummary(
  db: Database,
  teamUuid: string,
  days = 30,
): Promise<CostSummary> {
  const [result] = await db
    .select({
      totalCostCents: sql<number>`coalesce(sum(${taskMetrics.costCents}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${taskMetrics.tokensUsed}), 0)::int`,
      totalPromptTokens: sql<number>`coalesce(sum(${taskMetrics.promptTokens}), 0)::int`,
      totalCompletionTokens: sql<number>`coalesce(sum(${taskMetrics.completionTokens}), 0)::int`,
      avgLatencyMs: sql<number>`coalesce(avg(${taskMetrics.latencyMs}), 0)::int`,
      executionCount: sql<number>`count(*)::int`,
    })
    .from(taskMetrics)
    .where(and(
      eq(taskMetrics.teamUuid, teamUuid),
      sql`${taskMetrics.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`,
    ));

  return {
    totalCostCents: result?.totalCostCents ?? 0,
    totalTokens: result?.totalTokens ?? 0,
    totalPromptTokens: result?.totalPromptTokens ?? 0,
    totalCompletionTokens: result?.totalCompletionTokens ?? 0,
    avgLatencyMs: result?.avgLatencyMs ?? 0,
    executionCount: result?.executionCount ?? 0,
  };
}

/**
 * Gets cost breakdown per agent for a team.
 */
export async function getAgentCostBreakdown(
  db: Database,
  teamUuid: string,
  days = 30,
): Promise<Array<{
  agentId: string | null;
  agentUuid: string | null;
  totalCostCents: number;
  totalTokens: number;
  executionCount: number;
  avgLatencyMs: number;
}>> {
  const rows = await db
    .select({
      agentId: taskMetrics.agentId,
      agentUuid: taskMetrics.agentUuid,
      totalCostCents: sql<number>`coalesce(sum(${taskMetrics.costCents}), 0)::int`,
      totalTokens: sql<number>`coalesce(sum(${taskMetrics.tokensUsed}), 0)::int`,
      executionCount: sql<number>`count(*)::int`,
      avgLatencyMs: sql<number>`coalesce(avg(${taskMetrics.latencyMs}), 0)::int`,
    })
    .from(taskMetrics)
    .where(and(
      eq(taskMetrics.teamUuid, teamUuid),
      sql`${taskMetrics.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`,
    ))
    .groupBy(taskMetrics.agentId, taskMetrics.agentUuid)
    .orderBy(sql`sum(${taskMetrics.costCents}) DESC`);

  return rows.map(r => ({
    agentId: r.agentId ?? null,
    agentUuid: r.agentUuid ?? null,
    totalCostCents: r.totalCostCents,
    totalTokens: r.totalTokens,
    executionCount: r.executionCount,
    avgLatencyMs: r.avgLatencyMs,
  }));
}

/**
 * Gets cost breakdown per workflow run.
 */
export async function getWorkflowCostBreakdown(
  db: Database,
  workflowRunId: string,
): Promise<Array<{
  stageId: string | null;
  agentId: string | null;
  costCents: number;
  tokensUsed: number;
  latencyMs: number;
  provider: string | null;
  model: string | null;
}>> {
  const rows = await db
    .select({
      stageId: taskMetrics.stageId,
      agentId: taskMetrics.agentId,
      costCents: taskMetrics.costCents,
      tokensUsed: taskMetrics.tokensUsed,
      latencyMs: taskMetrics.latencyMs,
      provider: taskMetrics.provider,
      model: taskMetrics.model,
    })
    .from(taskMetrics)
    .where(eq(taskMetrics.workflowRunId, workflowRunId))
    .orderBy(taskMetrics.createdAt);

  return rows.map(r => ({
    stageId: r.stageId ?? null,
    agentId: r.agentId ?? null,
    costCents: r.costCents,
    tokensUsed: r.tokensUsed,
    latencyMs: r.latencyMs,
    provider: r.provider ?? null,
    model: r.model ?? null,
  }));
}

/**
 * Gets daily cost time-series for a team.
 */
export async function getDailyCostTimeSeries(
  db: Database,
  teamUuid: string,
  days = 30,
): Promise<Array<{ date: string; costCents: number; tokens: number; executions: number }>> {
  const rows = await db
    .select({
      date: sql<string>`to_char(${taskMetrics.createdAt}, 'YYYY-MM-DD')`,
      costCents: sql<number>`coalesce(sum(${taskMetrics.costCents}), 0)::int`,
      tokens: sql<number>`coalesce(sum(${taskMetrics.tokensUsed}), 0)::int`,
      executions: sql<number>`count(*)::int`,
    })
    .from(taskMetrics)
    .where(and(
      eq(taskMetrics.teamUuid, teamUuid),
      sql`${taskMetrics.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`,
    ))
    .groupBy(sql`to_char(${taskMetrics.createdAt}, 'YYYY-MM-DD')`)
    .orderBy(sql`to_char(${taskMetrics.createdAt}, 'YYYY-MM-DD')`);

  return rows;
}
