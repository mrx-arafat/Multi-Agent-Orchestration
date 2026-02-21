/**
 * Analytics service — team-scoped metrics for task completion,
 * agent utilization, workflow success rates, and time-series data.
 */
import { eq, and, sql, gte, lte, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { kanbanTasks, agents, workflowRuns, stageExecutions } from '../../db/schema/index.js';

// ── Task Completion Analytics ─────────────────────────────────────────

export interface TaskCompletionMetrics {
  total: number;
  byStatus: Record<string, number>;
  completionRate: number;
  avgCompletionTimeMs: number | null;
  byPriority: Record<string, { total: number; completed: number }>;
}

export async function getTaskCompletionMetrics(
  db: Database,
  teamUuid: string,
  dateStart?: string,
  dateEnd?: string,
): Promise<TaskCompletionMetrics> {
  const conditions = [eq(kanbanTasks.teamUuid, teamUuid)];
  if (dateStart) conditions.push(gte(kanbanTasks.createdAt, new Date(dateStart)));
  if (dateEnd) {
    const end = new Date(dateEnd);
    end.setDate(end.getDate() + 1);
    conditions.push(lte(kanbanTasks.createdAt, end));
  }

  const whereClause = and(...conditions);

  const [statusCounts, priorityCounts, avgTime] = await Promise.all([
    db
      .select({
        status: kanbanTasks.status,
        count: sql<number>`count(*)::int`,
      })
      .from(kanbanTasks)
      .where(whereClause)
      .groupBy(kanbanTasks.status),
    db
      .select({
        priority: kanbanTasks.priority,
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where status = 'done')::int`,
      })
      .from(kanbanTasks)
      .where(whereClause)
      .groupBy(kanbanTasks.priority),
    db
      .select({
        avgMs: sql<number>`avg(extract(epoch from (completed_at - started_at)) * 1000)::int`,
      })
      .from(kanbanTasks)
      .where(and(...conditions, sql`completed_at IS NOT NULL`, sql`started_at IS NOT NULL`)),
  ]);

  const byStatus: Record<string, number> = { backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0 };
  let total = 0;
  for (const row of statusCounts) {
    byStatus[row.status] = row.count;
    total += row.count;
  }

  const byPriority: Record<string, { total: number; completed: number }> = {};
  for (const row of priorityCounts) {
    byPriority[row.priority] = { total: row.total, completed: row.completed };
  }

  const completedCount = byStatus['done'] ?? 0;
  const completionRate = total > 0 ? Math.round((completedCount / total) * 10000) / 100 : 0;

  return {
    total,
    byStatus,
    completionRate,
    avgCompletionTimeMs: avgTime[0]?.avgMs ?? null,
    byPriority,
  };
}

// ── Agent Utilization Analytics ───────────────────────────────────────

export interface AgentUtilization {
  agentUuid: string;
  agentId: string;
  name: string;
  status: string;
  tasksAssigned: number;
  tasksCompleted: number;
  stagesExecuted: number;
  avgExecutionTimeMs: number | null;
  utilizationRate: number;
}

export async function getAgentUtilization(
  db: Database,
  teamUuid: string,
): Promise<AgentUtilization[]> {
  // Get agents in team with their task counts
  const agentRows = await db
    .select({
      agentUuid: agents.agentUuid,
      agentId: agents.agentId,
      name: agents.name,
      status: agents.status,
      maxConcurrentTasks: agents.maxConcurrentTasks,
    })
    .from(agents)
    .where(and(eq(agents.teamUuid, teamUuid), isNull(agents.deletedAt)));

  if (agentRows.length === 0) return [];

  const results: AgentUtilization[] = [];

  for (const agent of agentRows) {
    const [taskStats, stageStats] = await Promise.all([
      db
        .select({
          assigned: sql<number>`count(*)::int`,
          completed: sql<number>`count(*) filter (where status = 'done')::int`,
        })
        .from(kanbanTasks)
        .where(and(
          eq(kanbanTasks.teamUuid, teamUuid),
          eq(kanbanTasks.assignedAgentUuid, agent.agentUuid),
        )),
      db
        .select({
          executed: sql<number>`count(*)::int`,
          avgMs: sql<number>`avg(execution_time_ms)::int`,
        })
        .from(stageExecutions)
        .where(eq(stageExecutions.agentId, agent.agentId)),
    ]);

    const assigned = taskStats[0]?.assigned ?? 0;
    const completed = taskStats[0]?.completed ?? 0;
    const utilizationRate = assigned > 0 ? Math.round((completed / assigned) * 10000) / 100 : 0;

    results.push({
      agentUuid: agent.agentUuid,
      agentId: agent.agentId,
      name: agent.name,
      status: agent.status,
      tasksAssigned: assigned,
      tasksCompleted: completed,
      stagesExecuted: stageStats[0]?.executed ?? 0,
      avgExecutionTimeMs: stageStats[0]?.avgMs ?? null,
      utilizationRate,
    });
  }

  return results;
}

// ── Workflow Success Analytics ─────────────────────────────────────────

export interface WorkflowMetrics {
  total: number;
  byStatus: Record<string, number>;
  successRate: number;
  avgDurationMs: number | null;
  avgStagesPerWorkflow: number | null;
}

export async function getWorkflowMetrics(
  db: Database,
  userUuid?: string,
  dateStart?: string,
  dateEnd?: string,
): Promise<WorkflowMetrics> {
  const conditions: ReturnType<typeof eq>[] = [];
  if (userUuid) conditions.push(eq(workflowRuns.userUuid, userUuid));
  if (dateStart) conditions.push(gte(workflowRuns.createdAt, new Date(dateStart)));
  if (dateEnd) {
    const end = new Date(dateEnd);
    end.setDate(end.getDate() + 1);
    conditions.push(lte(workflowRuns.createdAt, end));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [statusCounts, durationStats, stageAvg] = await Promise.all([
    db
      .select({
        status: workflowRuns.status,
        count: sql<number>`count(*)::int`,
      })
      .from(workflowRuns)
      .where(whereClause)
      .groupBy(workflowRuns.status),
    db
      .select({
        avgMs: sql<number>`avg(extract(epoch from (completed_at - started_at)) * 1000)::int`,
      })
      .from(workflowRuns)
      .where(whereClause ? and(whereClause, sql`completed_at IS NOT NULL`, sql`started_at IS NOT NULL`) : and(sql`completed_at IS NOT NULL`, sql`started_at IS NOT NULL`)),
    db
      .select({
        avgStages: sql<number>`avg(stage_count)::numeric(10,1)`,
      })
      .from(
        db
          .select({
            runId: stageExecutions.workflowRunId,
            stage_count: sql<number>`count(*)::int`,
          })
          .from(stageExecutions)
          .groupBy(stageExecutions.workflowRunId)
          .as('stage_counts'),
      ),
  ]);

  const byStatus: Record<string, number> = { queued: 0, in_progress: 0, completed: 0, failed: 0 };
  let total = 0;
  for (const row of statusCounts) {
    byStatus[row.status] = row.count;
    total += row.count;
  }

  const completedCount = byStatus['completed'] ?? 0;
  const failedCount = byStatus['failed'] ?? 0;
  const finishedCount = completedCount + failedCount;
  const successRate = finishedCount > 0 ? Math.round((completedCount / finishedCount) * 10000) / 100 : 0;

  return {
    total,
    byStatus,
    successRate,
    avgDurationMs: durationStats[0]?.avgMs ?? null,
    avgStagesPerWorkflow: stageAvg[0]?.avgStages ? parseFloat(String(stageAvg[0].avgStages)) : null,
  };
}

// ── Time-Series Analytics ─────────────────────────────────────────────

export interface TimeSeriesPoint {
  date: string;
  tasksCreated: number;
  tasksCompleted: number;
  workflowsStarted: number;
  workflowsCompleted: number;
  workflowsFailed: number;
}

export async function getTimeSeries(
  db: Database,
  teamUuid: string,
  days = 30,
): Promise<TimeSeriesPoint[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const [taskCreated, taskCompleted, wfStarted, wfCompleted, wfFailed] = await Promise.all([
    db
      .select({
        date: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(kanbanTasks)
      .where(and(eq(kanbanTasks.teamUuid, teamUuid), gte(kanbanTasks.createdAt, startDate)))
      .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`),
    db
      .select({
        date: sql<string>`to_char(completed_at, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(kanbanTasks)
      .where(and(
        eq(kanbanTasks.teamUuid, teamUuid),
        gte(kanbanTasks.completedAt, startDate),
        sql`completed_at IS NOT NULL`,
      ))
      .groupBy(sql`to_char(completed_at, 'YYYY-MM-DD')`),
    db
      .select({
        date: sql<string>`to_char(created_at, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(workflowRuns)
      .where(gte(workflowRuns.createdAt, startDate))
      .groupBy(sql`to_char(created_at, 'YYYY-MM-DD')`),
    db
      .select({
        date: sql<string>`to_char(completed_at, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(workflowRuns)
      .where(and(
        gte(workflowRuns.completedAt, startDate),
        eq(workflowRuns.status, 'completed'),
      ))
      .groupBy(sql`to_char(completed_at, 'YYYY-MM-DD')`),
    db
      .select({
        date: sql<string>`to_char(completed_at, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(workflowRuns)
      .where(and(
        gte(workflowRuns.completedAt, startDate),
        eq(workflowRuns.status, 'failed'),
      ))
      .groupBy(sql`to_char(completed_at, 'YYYY-MM-DD')`),
  ]);

  // Build date map
  const dateMap = new Map<string, TimeSeriesPoint>();
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);
    dateMap.set(key, {
      date: key,
      tasksCreated: 0,
      tasksCompleted: 0,
      workflowsStarted: 0,
      workflowsCompleted: 0,
      workflowsFailed: 0,
    });
  }

  for (const row of taskCreated) { const p = dateMap.get(row.date); if (p) p.tasksCreated = row.count; }
  for (const row of taskCompleted) { const p = dateMap.get(row.date); if (p) p.tasksCompleted = row.count; }
  for (const row of wfStarted) { const p = dateMap.get(row.date); if (p) p.workflowsStarted = row.count; }
  for (const row of wfCompleted) { const p = dateMap.get(row.date); if (p) p.workflowsCompleted = row.count; }
  for (const row of wfFailed) { const p = dateMap.get(row.date); if (p) p.workflowsFailed = row.count; }

  return Array.from(dateMap.values());
}

// ── Dashboard Overview Stats ──────────────────────────────────────────

export interface OverviewStats {
  totalAgents: number;
  onlineAgents: number;
  totalTasks: number;
  completedTasks: number;
  activeTasks: number;
  totalWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
}

export async function getOverviewStats(
  db: Database,
  teamUuid: string,
): Promise<OverviewStats> {
  const [agentStats, taskStats, wfStats] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        online: sql<number>`count(*) filter (where status = 'online')::int`,
      })
      .from(agents)
      .where(and(eq(agents.teamUuid, teamUuid), isNull(agents.deletedAt))),
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where status = 'done')::int`,
        active: sql<number>`count(*) filter (where status IN ('in_progress', 'review'))::int`,
      })
      .from(kanbanTasks)
      .where(eq(kanbanTasks.teamUuid, teamUuid)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      })
      .from(workflowRuns),
  ]);

  return {
    totalAgents: agentStats[0]?.total ?? 0,
    onlineAgents: agentStats[0]?.online ?? 0,
    totalTasks: taskStats[0]?.total ?? 0,
    completedTasks: taskStats[0]?.completed ?? 0,
    activeTasks: taskStats[0]?.active ?? 0,
    totalWorkflows: wfStats[0]?.total ?? 0,
    completedWorkflows: wfStats[0]?.completed ?? 0,
    failedWorkflows: wfStats[0]?.failed ?? 0,
  };
}
