/**
 * Context Resolver — resolves task dependency chains and input mappings.
 *
 * When a task completes, this service:
 * 1. Resolves `inputMapping` templates for downstream tasks using upstream outputs
 * 2. Checks if downstream tasks are now unblocked (all deps completed)
 * 3. Auto-promotes unblocked tasks from 'backlog' to 'todo'
 *
 * Template syntax: {{taskUuid.output.fieldName}} or {{taskUuid.result}}
 */
import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { kanbanTasks } from '../../db/schema/index.js';
import { emitTeamEvent } from '../../lib/event-bus.js';

/**
 * Resolves a template string by replacing {{taskUuid.output.field}} with actual values.
 * Supports nested field access: {{uuid.output.findings.critical}}
 */
export function resolveTemplate(
  template: unknown,
  taskOutputs: Map<string, { output: unknown; result: string | null }>,
): unknown {
  if (typeof template === 'string') {
    return template.replace(/\{\{([^}]+)\}\}/g, (match, path: string) => {
      const parts = path.trim().split('.');
      const taskUuid = parts[0] ?? '';
      const source = parts[1]; // 'output' or 'result'

      const taskData = taskOutputs.get(taskUuid);
      if (!taskData) return match; // Unresolved — keep template

      if (source === 'result') {
        return taskData.result ?? '';
      }

      if (source === 'output') {
        // Navigate nested fields: {{uuid.output.findings.critical}}
        let value: unknown = taskData.output;
        for (let i = 2; i < parts.length; i++) {
          if (value === null || value === undefined) return '';
          if (typeof value === 'object') {
            value = (value as Record<string, unknown>)[parts[i]!];
          } else {
            return '';
          }
        }
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value ?? '');
      }

      return match;
    });
  }

  if (Array.isArray(template)) {
    return template.map((v) => resolveTemplate(v, taskOutputs));
  }

  if (template !== null && typeof template === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(template as Record<string, unknown>)) {
      result[k] = resolveTemplate(v, taskOutputs);
    }
    return result;
  }

  return template;
}

/**
 * When a task completes, find all downstream tasks that depend on it,
 * check if they are now fully unblocked, and promote them.
 *
 * Returns the list of task UUIDs that were unblocked and promoted.
 */
export async function processTaskCompletion(
  db: Database,
  completedTaskUuid: string,
  teamUuid: string,
): Promise<string[]> {
  // Find all tasks in this team that have completedTaskUuid in their dependsOn
  const dependentTasks = await db
    .select()
    .from(kanbanTasks)
    .where(and(
      eq(kanbanTasks.teamUuid, teamUuid),
      sql`${kanbanTasks.dependsOn} @> ARRAY[${completedTaskUuid}]::uuid[]`,
      eq(kanbanTasks.status, 'backlog'),
    ));

  if (dependentTasks.length === 0) return [];

  const unblockedTaskUuids: string[] = [];

  for (const task of dependentTasks) {
    // Check if ALL dependencies are now completed
    const allDepsCompleted = await checkAllDependenciesCompleted(db, task.dependsOn, teamUuid);

    if (allDepsCompleted) {
      // Resolve input mapping if present
      let resolvedInput: unknown = null;
      if (task.inputMapping) {
        const taskOutputs = await fetchTaskOutputs(db, task.dependsOn);
        resolvedInput = resolveTemplate(task.inputMapping, taskOutputs);
      }

      // Promote task from backlog → todo
      await db
        .update(kanbanTasks)
        .set({
          status: 'todo',
          description: resolvedInput
            ? `${task.description ?? ''}\n\n---\nResolved context:\n${JSON.stringify(resolvedInput, null, 2)}`
            : task.description,
          updatedAt: new Date(),
        })
        .where(eq(kanbanTasks.taskUuid, task.taskUuid));

      unblockedTaskUuids.push(task.taskUuid);

      emitTeamEvent(teamUuid, 'task:unblocked', {
        taskUuid: task.taskUuid,
        unblockedBy: completedTaskUuid,
        resolvedInput,
      });
    }
  }

  return unblockedTaskUuids;
}

/**
 * Check if all task UUIDs in the dependency list are in 'done' status.
 */
async function checkAllDependenciesCompleted(
  db: Database,
  dependsOn: string[],
  teamUuid: string,
): Promise<boolean> {
  if (dependsOn.length === 0) return true;

  const [result] = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status = 'done')::int`,
    })
    .from(kanbanTasks)
    .where(and(
      eq(kanbanTasks.teamUuid, teamUuid),
      sql`${kanbanTasks.taskUuid} = ANY(ARRAY[${sql.join(dependsOn.map(id => sql`${id}`), sql`, `)}]::uuid[])`,
    ));

  return (result?.total ?? 0) > 0 && result?.total === result?.completed;
}

/**
 * Fetch outputs from completed tasks for input mapping resolution.
 */
async function fetchTaskOutputs(
  db: Database,
  taskUuids: string[],
): Promise<Map<string, { output: unknown; result: string | null }>> {
  if (taskUuids.length === 0) return new Map();

  const tasks = await db
    .select({
      taskUuid: kanbanTasks.taskUuid,
      output: kanbanTasks.output,
      result: kanbanTasks.result,
    })
    .from(kanbanTasks)
    .where(
      sql`${kanbanTasks.taskUuid} = ANY(ARRAY[${sql.join(taskUuids.map(id => sql`${id}`), sql`, `)}]::uuid[])`,
    );

  const map = new Map<string, { output: unknown; result: string | null }>();
  for (const t of tasks) {
    map.set(t.taskUuid, { output: t.output, result: t.result });
  }
  return map;
}

/**
 * Gets the full dependency graph for a task — all upstream tasks and their outputs.
 * Useful for agents to understand the full context chain before execution.
 */
export async function getTaskDependencyContext(
  db: Database,
  taskUuid: string,
): Promise<{
  task: { taskUuid: string; title: string; dependsOn: string[]; inputMapping: unknown };
  upstreamTasks: Array<{
    taskUuid: string;
    title: string;
    status: string;
    output: unknown;
    result: string | null;
  }>;
  resolvedInput: unknown | null;
}> {
  const [task] = await db
    .select({
      taskUuid: kanbanTasks.taskUuid,
      title: kanbanTasks.title,
      dependsOn: kanbanTasks.dependsOn,
      inputMapping: kanbanTasks.inputMapping,
      teamUuid: kanbanTasks.teamUuid,
    })
    .from(kanbanTasks)
    .where(eq(kanbanTasks.taskUuid, taskUuid))
    .limit(1);

  if (!task) {
    return {
      task: { taskUuid, title: '', dependsOn: [], inputMapping: null },
      upstreamTasks: [],
      resolvedInput: null,
    };
  }

  let upstreamTasks: Array<{
    taskUuid: string;
    title: string;
    status: string;
    output: unknown;
    result: string | null;
  }> = [];

  let resolvedInput: unknown | null = null;

  if (task.dependsOn.length > 0) {
    const upstreamRows = await db
      .select({
        taskUuid: kanbanTasks.taskUuid,
        title: kanbanTasks.title,
        status: kanbanTasks.status,
        output: kanbanTasks.output,
        result: kanbanTasks.result,
      })
      .from(kanbanTasks)
      .where(
        sql`${kanbanTasks.taskUuid} = ANY(ARRAY[${sql.join(task.dependsOn.map(id => sql`${id}`), sql`, `)}]::uuid[])`,
      );

    upstreamTasks = upstreamRows.map(r => ({
      taskUuid: r.taskUuid,
      title: r.title,
      status: r.status,
      output: r.output,
      result: r.result,
    }));

    if (task.inputMapping) {
      const taskOutputs = new Map<string, { output: unknown; result: string | null }>();
      for (const r of upstreamRows) {
        taskOutputs.set(r.taskUuid, { output: r.output, result: r.result });
      }
      resolvedInput = resolveTemplate(task.inputMapping, taskOutputs);
    }
  }

  return {
    task: {
      taskUuid: task.taskUuid,
      title: task.title,
      dependsOn: task.dependsOn,
      inputMapping: task.inputMapping,
    },
    upstreamTasks,
    resolvedInput,
  };
}
