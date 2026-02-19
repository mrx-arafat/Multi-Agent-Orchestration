/**
 * Kanban task board service.
 * Agents create, claim, update, and complete tasks on a team's board.
 * Tasks have status (backlog → todo → in_progress → review → done),
 * tags for capability matching, and priority levels.
 */
import { eq, and, sql, desc, asc, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { kanbanTasks, agents } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import { assertTeamMember } from '../teams/service.js';

export interface SafeKanbanTask {
  taskUuid: string;
  teamUuid: string;
  workflowRunId: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  tags: string[];
  assignedAgentUuid: string | null;
  createdByAgentUuid: string | null;
  createdByUserUuid: string | null;
  parentTaskUuid: string | null;
  stageId: string | null;
  result: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

function toSafe(task: typeof kanbanTasks.$inferSelect): SafeKanbanTask {
  return {
    taskUuid: task.taskUuid,
    teamUuid: task.teamUuid,
    workflowRunId: task.workflowRunId ?? null,
    title: task.title,
    description: task.description ?? null,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    assignedAgentUuid: task.assignedAgentUuid ?? null,
    createdByAgentUuid: task.createdByAgentUuid ?? null,
    createdByUserUuid: task.createdByUserUuid ?? null,
    parentTaskUuid: task.parentTaskUuid ?? null,
    stageId: task.stageId ?? null,
    result: task.result ?? null,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    startedAt: task.startedAt ?? null,
    completedAt: task.completedAt ?? null,
  };
}

/**
 * Creates a task on a team's kanban board.
 */
export async function createTask(
  db: Database,
  params: {
    teamUuid: string;
    title: string;
    description?: string;
    priority?: string;
    tags?: string[];
    workflowRunId?: string;
    createdByUserUuid?: string;
    createdByAgentUuid?: string;
    parentTaskUuid?: string;
    stageId?: string;
  },
): Promise<SafeKanbanTask> {
  const [created] = await db
    .insert(kanbanTasks)
    .values({
      teamUuid: params.teamUuid,
      title: params.title,
      description: params.description,
      priority: (params.priority ?? 'medium') as 'low' | 'medium' | 'high' | 'critical',
      tags: params.tags ?? [],
      workflowRunId: params.workflowRunId,
      createdByUserUuid: params.createdByUserUuid,
      createdByAgentUuid: params.createdByAgentUuid,
      parentTaskUuid: params.parentTaskUuid,
      stageId: params.stageId,
      status: 'backlog',
    })
    .returning();

  if (!created) throw ApiError.internal('Failed to create kanban task');
  return toSafe(created);
}

/**
 * Lists tasks for a team's board. Filterable by status, tags, assigned agent.
 */
export async function listTasks(
  db: Database,
  teamUuid: string,
  params: {
    status?: string;
    tag?: string;
    assignedAgentUuid?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ tasks: SafeKanbanTask[]; meta: { total: number; page: number; limit: number } }> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(kanbanTasks.teamUuid, teamUuid)];

  if (params.status) {
    conditions.push(eq(kanbanTasks.status, params.status as 'backlog' | 'todo' | 'in_progress' | 'review' | 'done'));
  }
  if (params.tag) {
    conditions.push(sql`${kanbanTasks.tags} @> ARRAY[${params.tag}]::text[]`);
  }
  if (params.assignedAgentUuid) {
    conditions.push(eq(kanbanTasks.assignedAgentUuid, params.assignedAgentUuid));
  }

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.select().from(kanbanTasks).where(whereClause)
      .orderBy(
        asc(sql`CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`),
        desc(kanbanTasks.createdAt),
      )
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(kanbanTasks).where(whereClause),
  ]);

  return {
    tasks: rows.map(toSafe),
    meta: { total: countResult[0]?.count ?? 0, page, limit },
  };
}

/**
 * An agent claims a task (assigns itself and moves to in_progress).
 */
export async function claimTask(
  db: Database,
  taskUuid: string,
  agentUuid: string,
  teamUuid: string,
): Promise<SafeKanbanTask> {
  const [task] = await db
    .select()
    .from(kanbanTasks)
    .where(and(eq(kanbanTasks.taskUuid, taskUuid), eq(kanbanTasks.teamUuid, teamUuid)))
    .limit(1);

  if (!task) throw ApiError.notFound('Task');
  if (task.status !== 'backlog' && task.status !== 'todo') {
    throw ApiError.badRequest(`Cannot claim a task in '${task.status}' status`);
  }
  if (task.assignedAgentUuid && task.assignedAgentUuid !== agentUuid) {
    throw ApiError.conflict('Task is already assigned to another agent');
  }

  // Verify agent belongs to this team
  const [agent] = await db
    .select({ teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent || agent.teamUuid !== teamUuid) {
    throw ApiError.forbidden('Agent is not a member of this team');
  }

  const [updated] = await db
    .update(kanbanTasks)
    .set({
      assignedAgentUuid: agentUuid,
      status: 'in_progress',
      startedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(kanbanTasks.taskUuid, taskUuid))
    .returning();

  if (!updated) throw ApiError.internal('Failed to claim task');
  return toSafe(updated);
}

/**
 * Updates a task's status. Valid transitions:
 * backlog → todo → in_progress → review → done
 * (also allows backwards: review → in_progress, etc.)
 */
export async function updateTaskStatus(
  db: Database,
  taskUuid: string,
  teamUuid: string,
  status: string,
  result?: string,
): Promise<SafeKanbanTask> {
  const updates: Record<string, unknown> = {
    status,
    updatedAt: new Date(),
  };

  if (status === 'in_progress' || status === 'review') {
    updates.startedAt = new Date();
  }
  if (status === 'done') {
    updates.completedAt = new Date();
    if (result) updates.result = result;
  }

  const [updated] = await db
    .update(kanbanTasks)
    .set(updates)
    .where(and(eq(kanbanTasks.taskUuid, taskUuid), eq(kanbanTasks.teamUuid, teamUuid)))
    .returning();

  if (!updated) throw ApiError.notFound('Task');
  return toSafe(updated);
}

/**
 * Gets the board summary (task counts by status) for a team.
 */
export async function getBoardSummary(
  db: Database,
  teamUuid: string,
): Promise<Record<string, number>> {
  const result = await db
    .select({
      status: kanbanTasks.status,
      count: sql<number>`count(*)::int`,
    })
    .from(kanbanTasks)
    .where(eq(kanbanTasks.teamUuid, teamUuid))
    .groupBy(kanbanTasks.status);

  const summary: Record<string, number> = {
    backlog: 0, todo: 0, in_progress: 0, review: 0, done: 0,
  };
  for (const row of result) {
    summary[row.status] = row.count;
  }
  return summary;
}
