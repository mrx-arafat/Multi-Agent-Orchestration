/**
 * A2A Service — Google Agent-to-Agent protocol implementation.
 *
 * Handles JSON-RPC 2.0 methods:
 *   - message/send   → Route a message/task to a MAOF agent
 *   - tasks/get      → Get task status by ID
 *   - tasks/cancel   → Cancel a running task
 *
 * Maps A2A concepts to MAOF internals:
 *   A2A Task       → MAOF kanbanTask
 *   A2A Message     → Creates a kanbanTask or agentMessage
 *   A2A Artifact    → MAOF task output
 *   A2A TaskState   → MAOF task status
 */
import { eq, and, isNull, isNotNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { agents, kanbanTasks } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import type { MaofAgentInfo } from './agent-card.js';

// ── A2A Types ────────────────────────────────────────────────────────

export interface A2AMessage {
  role: 'user' | 'agent';
  parts: A2APart[];
}

export interface A2APart {
  type: 'text' | 'data' | 'file';
  text?: string;
  data?: Record<string, unknown>;
  mimeType?: string;
}

export interface A2AArtifact {
  name: string;
  description?: string;
  parts: A2APart[];
}

export type A2ATaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface A2ATask {
  id: string;
  status: {
    state: A2ATaskState;
    message?: A2AMessage;
    timestamp: string;
  };
  artifacts?: A2AArtifact[];
  history?: A2AMessage[];
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// ── Status Mapping ───────────────────────────────────────────────────

const MAOF_TO_A2A_STATE: Record<string, A2ATaskState> = {
  backlog: 'submitted',
  todo: 'submitted',
  in_progress: 'working',
  review: 'working',
  done: 'completed',
};

function toA2AState(maofStatus: string): A2ATaskState {
  return MAOF_TO_A2A_STATE[maofStatus] ?? 'submitted';
}

function toMaofTask(task: typeof kanbanTasks.$inferSelect): A2ATask {
  const artifacts: A2AArtifact[] = [];
  if (task.result) {
    artifacts.push({
      name: 'result',
      parts: [{ type: 'text', text: task.result }],
    });
  }
  if (task.output) {
    artifacts.push({
      name: 'output',
      parts: [{ type: 'data', data: task.output as Record<string, unknown> }],
    });
  }

  return {
    id: task.taskUuid,
    status: {
      state: toA2AState(task.status),
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: task.result ?? `Task is ${task.status}` }],
      },
      timestamp: (task.updatedAt ?? task.createdAt).toISOString(),
    },
    ...(artifacts.length > 0 ? { artifacts } : {}),
  };
}

// ── Service Functions ────────────────────────────────────────────────

/**
 * Get all online MAOF agents for Agent Card generation.
 */
export async function getActiveAgents(db: Database): Promise<MaofAgentInfo[]> {
  const rows = await db
    .select({
      agentUuid: agents.agentUuid,
      agentId: agents.agentId,
      name: agents.name,
      description: agents.description,
      capabilities: agents.capabilities,
      status: agents.status,
    })
    .from(agents)
    .where(isNull(agents.deletedAt))
    .limit(200);

  return rows.map(r => ({
    agentUuid: r.agentUuid,
    agentId: r.agentId,
    name: r.name,
    description: r.description,
    capabilities: r.capabilities,
    status: r.status,
  }));
}

/**
 * Handle JSON-RPC method: message/send
 * Creates a task on the matching agent's team board.
 */
export async function handleMessageSend(
  db: Database,
  params: Record<string, unknown>,
): Promise<A2ATask> {
  const message = params.message as A2AMessage | undefined;
  if (!message || !message.parts?.length) {
    throw ApiError.badRequest('message.parts is required');
  }

  const textPart = message.parts.find(p => p.type === 'text');
  const dataPart = message.parts.find(p => p.type === 'data');
  const title = textPart?.text ?? 'A2A Task';
  const capability = (params.skill as string) ?? null;

  // Find the best agent for this capability
  let targetTeamUuid: string | null = null;

  if (capability) {
    // Match by capability using array overlap
    const [match] = await db
      .select({ teamUuid: agents.teamUuid })
      .from(agents)
      .where(and(
        isNull(agents.deletedAt),
        isNotNull(agents.teamUuid),
        sql`${agents.capabilities} @> ARRAY[${capability}]::text[]`,
      ))
      .limit(1);
    if (match?.teamUuid) targetTeamUuid = match.teamUuid;
  }

  if (!targetTeamUuid) {
    // Fallback: pick any agent that has a team
    const [any] = await db
      .select({ teamUuid: agents.teamUuid })
      .from(agents)
      .where(and(isNull(agents.deletedAt), isNotNull(agents.teamUuid)))
      .limit(1);
    if (!any?.teamUuid) throw ApiError.badRequest('No agents available');
    targetTeamUuid = any.teamUuid;
  }

  const [task] = await db
    .insert(kanbanTasks)
    .values({
      teamUuid: targetTeamUuid,
      title: title.slice(0, 500),
      description: dataPart?.data ? JSON.stringify(dataPart.data) : undefined,
      tags: capability ? [capability] : [],
      priority: 'medium',
      status: 'todo',
    })
    .returning();

  if (!task) throw ApiError.internal('Failed to create A2A task');

  return toMaofTask(task);
}

/**
 * Handle JSON-RPC method: tasks/get
 */
export async function handleTasksGet(
  db: Database,
  params: Record<string, unknown>,
): Promise<A2ATask> {
  const taskId = params.id as string;
  if (!taskId) throw ApiError.badRequest('params.id is required');

  const [task] = await db
    .select()
    .from(kanbanTasks)
    .where(eq(kanbanTasks.taskUuid, taskId))
    .limit(1);

  if (!task) throw ApiError.notFound('Task');

  return toMaofTask(task);
}

/**
 * Handle JSON-RPC method: tasks/cancel
 */
export async function handleTasksCancel(
  db: Database,
  params: Record<string, unknown>,
): Promise<A2ATask> {
  const taskId = params.id as string;
  if (!taskId) throw ApiError.badRequest('params.id is required');

  const [task] = await db
    .select()
    .from(kanbanTasks)
    .where(eq(kanbanTasks.taskUuid, taskId))
    .limit(1);

  if (!task) throw ApiError.notFound('Task');

  if (task.status === 'done') {
    throw ApiError.conflict('Cannot cancel a completed task');
  }

  const [updated] = await db
    .update(kanbanTasks)
    .set({
      status: 'done',
      result: 'Canceled via A2A protocol',
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(kanbanTasks.taskUuid, taskId))
    .returning();

  if (!updated) throw ApiError.internal('Failed to cancel task');

  return {
    id: updated.taskUuid,
    status: {
      state: 'canceled',
      message: {
        role: 'agent',
        parts: [{ type: 'text', text: 'Task canceled' }],
      },
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Route a JSON-RPC request to the correct handler.
 */
export async function handleJsonRpc(
  db: Database,
  request: JsonRpcRequest,
): Promise<JsonRpcResponse> {
  const { id, method, params } = request;

  try {
    let result: unknown;

    switch (method) {
      case 'message/send':
        result = await handleMessageSend(db, params ?? {});
        break;
      case 'tasks/get':
        result = await handleTasksGet(db, params ?? {});
        break;
      case 'tasks/cancel':
        result = await handleTasksCancel(db, params ?? {});
        break;
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
    }

    return { jsonrpc: '2.0', id, result };
  } catch (err) {
    const apiErr = err as { statusCode?: number; message?: string };
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: apiErr.statusCode ?? -32000,
        message: apiErr.message ?? 'Internal error',
      },
    };
  }
}
