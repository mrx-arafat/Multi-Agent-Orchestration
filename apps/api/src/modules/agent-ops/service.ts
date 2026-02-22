/**
 * Agent Operations Service — agent-first APIs for the full task lifecycle.
 *
 * These endpoints are designed for agents to consume, wrapping the
 * kanban, messaging, and team systems into agent-friendly operations.
 */
import { eq, and, sql, isNull, desc } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { agents, kanbanTasks, teamMembers, teams, agentMessages } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import { emitTeamEvent, emitAgentEvent } from '../../lib/event-bus.js';

// ── Agent Onboarding ──────────────────────────────────────────────────

export interface AgentContext {
  agentUuid: string;
  agentId: string;
  name: string;
  capabilities: string[];
  teamUuid: string | null;
  status: string;
  teamName: string | null;
  teamRole: string | null;
  pendingTasks: number;
  unreadMessages: number;
}

/**
 * Returns the full operational context for an agent — everything it needs
 * to know about its current state, team, pending work, and unread messages.
 */
export async function getAgentContext(
  db: Database,
  agentUuid: string,
): Promise<AgentContext> {
  const [agent] = await db
    .select({
      agentUuid: agents.agentUuid,
      agentId: agents.agentId,
      name: agents.name,
      capabilities: agents.capabilities,
      teamUuid: agents.teamUuid,
      status: agents.status,
    })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');

  let teamName: string | null = null;
  let teamRole: string | null = null;
  let pendingTasks = 0;
  let unreadMessages = 0;

  if (agent.teamUuid) {
    // Get team info
    const [team] = await db
      .select({ name: teams.name })
      .from(teams)
      .where(eq(teams.teamUuid, agent.teamUuid))
      .limit(1);
    teamName = team?.name ?? null;

    // Count pending tasks assigned to this agent
    const [taskCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(kanbanTasks)
      .where(and(
        eq(kanbanTasks.teamUuid, agent.teamUuid),
        eq(kanbanTasks.assignedAgentUuid, agentUuid),
        sql`${kanbanTasks.status} IN ('todo', 'in_progress', 'review')`,
      ));
    pendingTasks = taskCount?.count ?? 0;

    // Count unread messages
  
    const [msgCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentMessages)
      .where(and(
        eq(agentMessages.teamUuid, agent.teamUuid),
        sql`(${agentMessages.toAgentUuid} = ${agentUuid} OR ${agentMessages.messageType} IN ('broadcast', 'system'))`,
        isNull(agentMessages.readAt),
      ));
    unreadMessages = msgCount?.count ?? 0;
  }

  return {
    agentUuid: agent.agentUuid,
    agentId: agent.agentId,
    name: agent.name,
    capabilities: agent.capabilities,
    teamUuid: agent.teamUuid,
    status: agent.status,
    teamName,
    teamRole,
    pendingTasks,
    unreadMessages,
  };
}

// ── Agent Task Lifecycle ──────────────────────────────────────────────

export interface AgentTask {
  taskUuid: string;
  teamUuid: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  tags: string[];
  assignedAgentUuid: string | null;
  createdAt: Date;
  startedAt: Date | null;
}

/**
 * Returns tasks available for an agent — unclaimed tasks matching
 * the agent's capabilities, plus tasks already assigned to the agent.
 */
export async function getAgentTasks(
  db: Database,
  agentUuid: string,
  filter: 'available' | 'assigned' | 'all',
): Promise<AgentTask[]> {
  const [agent] = await db
    .select({
      agentUuid: agents.agentUuid,
      capabilities: agents.capabilities,
      teamUuid: agents.teamUuid,
    })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');

  let rows;
  if (filter === 'assigned') {
    // Tasks assigned to this agent that aren't done
    rows = await db
      .select()
      .from(kanbanTasks)
      .where(and(
        eq(kanbanTasks.teamUuid, agent.teamUuid),
        eq(kanbanTasks.assignedAgentUuid, agentUuid),
        sql`${kanbanTasks.status} != 'done'`,
      ))
      .orderBy(
        sql`CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
        desc(kanbanTasks.createdAt),
      )
      .limit(50);
  } else if (filter === 'available') {
    // Unclaimed tasks in backlog/todo that match agent capabilities
    const capConditions = agent.capabilities.length > 0
      ? sql`(${kanbanTasks.tags} && ARRAY[${sql.join(agent.capabilities.map(c => sql`${c}`), sql`, `)}]::text[] OR array_length(${kanbanTasks.tags}, 1) IS NULL OR array_length(${kanbanTasks.tags}, 1) = 0)`
      : sql`TRUE`;

    rows = await db
      .select()
      .from(kanbanTasks)
      .where(and(
        eq(kanbanTasks.teamUuid, agent.teamUuid),
        isNull(kanbanTasks.assignedAgentUuid),
        sql`${kanbanTasks.status} IN ('backlog', 'todo')`,
        capConditions,
      ))
      .orderBy(
        sql`CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
        desc(kanbanTasks.createdAt),
      )
      .limit(50);
  } else {
    // All non-done tasks in the team
    rows = await db
      .select()
      .from(kanbanTasks)
      .where(and(
        eq(kanbanTasks.teamUuid, agent.teamUuid),
        sql`${kanbanTasks.status} != 'done'`,
      ))
      .orderBy(
        sql`CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END`,
        desc(kanbanTasks.createdAt),
      )
      .limit(100);
  }

  return rows.map(t => ({
    taskUuid: t.taskUuid,
    teamUuid: t.teamUuid,
    title: t.title,
    description: t.description ?? null,
    status: t.status,
    priority: t.priority,
    tags: t.tags,
    assignedAgentUuid: t.assignedAgentUuid ?? null,
    createdAt: t.createdAt,
    startedAt: t.startedAt ?? null,
  }));
}

/**
 * Agent starts a task — claims it and moves to in_progress.
 */
export async function startTask(
  db: Database,
  agentUuid: string,
  taskUuid: string,
): Promise<AgentTask> {
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');

  const [task] = await db
    .select()
    .from(kanbanTasks)
    .where(and(eq(kanbanTasks.taskUuid, taskUuid), eq(kanbanTasks.teamUuid, agent.teamUuid)))
    .limit(1);

  if (!task) throw ApiError.notFound('Task');
  if (task.assignedAgentUuid && task.assignedAgentUuid !== agentUuid) {
    throw ApiError.conflict('Task is assigned to another agent');
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

  if (!updated) throw ApiError.internal('Failed to start task');

  emitTeamEvent(agent.teamUuid, 'task:claimed', {
    taskUuid,
    agentUuid,
    status: 'in_progress',
  });

  // Push task to agent via dedicated agent channel (for WebSocket-connected agents)
  emitAgentEvent(agentUuid, 'task:push', {
    taskUuid: updated.taskUuid,
    title: updated.title,
    description: updated.description ?? null,
    priority: updated.priority,
    tags: updated.tags,
    action: 'start',
  });

  return {
    taskUuid: updated.taskUuid,
    teamUuid: updated.teamUuid,
    title: updated.title,
    description: updated.description ?? null,
    status: updated.status,
    priority: updated.priority,
    tags: updated.tags,
    assignedAgentUuid: updated.assignedAgentUuid ?? null,
    createdAt: updated.createdAt,
    startedAt: updated.startedAt ?? null,
  };
}

/**
 * Agent completes a task — sets status to done/review and stores the result.
 */
export async function completeTask(
  db: Database,
  agentUuid: string,
  taskUuid: string,
  result: string,
  moveToReview = false,
  output?: Record<string, unknown>,
): Promise<AgentTask & { output: unknown }> {
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');

  const [task] = await db
    .select()
    .from(kanbanTasks)
    .where(and(eq(kanbanTasks.taskUuid, taskUuid), eq(kanbanTasks.teamUuid, agent.teamUuid)))
    .limit(1);

  if (!task) throw ApiError.notFound('Task');
  if (task.assignedAgentUuid !== agentUuid) {
    throw ApiError.forbidden('Task is not assigned to you');
  }

  const newStatus = moveToReview ? 'review' : 'done';
  const updateValues: Record<string, unknown> = {
    status: newStatus as 'review' | 'done',
    result,
    completedAt: newStatus === 'done' ? new Date() : undefined,
    updatedAt: new Date(),
  };
  if (output) updateValues.output = output;

  const [updated] = await db
    .update(kanbanTasks)
    .set(updateValues)
    .where(eq(kanbanTasks.taskUuid, taskUuid))
    .returning();

  if (!updated) throw ApiError.internal('Failed to complete task');

  emitTeamEvent(agent.teamUuid, 'task:updated', {
    taskUuid,
    agentUuid,
    status: newStatus,
    result,
    output: output ?? null,
  });

  // Phase 9: Auto-trigger downstream dependent tasks
  if (newStatus === 'done') {
    const { processTaskCompletion } = await import('../kanban/context-resolver.js');
    processTaskCompletion(db, taskUuid, agent.teamUuid).catch(() => {});
  }

  return {
    taskUuid: updated.taskUuid,
    teamUuid: updated.teamUuid,
    title: updated.title,
    description: updated.description ?? null,
    status: updated.status,
    priority: updated.priority,
    tags: updated.tags,
    assignedAgentUuid: updated.assignedAgentUuid ?? null,
    createdAt: updated.createdAt,
    startedAt: updated.startedAt ?? null,
    output: updated.output ?? null,
  };
}

/**
 * Agent reports a task failure — handles retry logic.
 * If retries remaining, re-queues the task. Otherwise, marks as failed/dead-letter.
 */
export async function failTask(
  db: Database,
  agentUuid: string,
  taskUuid: string,
  error: string,
): Promise<AgentTask & { retryCount: number; maxRetries: number }> {
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');

  const [task] = await db
    .select()
    .from(kanbanTasks)
    .where(and(eq(kanbanTasks.taskUuid, taskUuid), eq(kanbanTasks.teamUuid, agent.teamUuid)))
    .limit(1);

  if (!task) throw ApiError.notFound('Task');
  if (task.assignedAgentUuid !== agentUuid) {
    throw ApiError.forbidden('Task is not assigned to you');
  }

  const newRetryCount = task.retryCount + 1;
  const canRetry = newRetryCount <= task.maxRetries;

  const updateValues: Record<string, unknown> = {
    assignedAgentUuid: null,
    retryCount: newRetryCount,
    lastError: error,
    updatedAt: new Date(),
    progressCurrent: null,
    progressTotal: null,
    progressMessage: null,
  };

  if (canRetry) {
    // Re-queue for another agent to pick up
    updateValues.status = 'todo';
    updateValues.result = `RETRY ${newRetryCount}/${task.maxRetries}: ${error}`;
  } else {
    // Exhausted retries — mark as done with failure info
    updateValues.status = 'done';
    updateValues.result = `FAILED (${newRetryCount} attempts): ${error}`;
    updateValues.completedAt = new Date();
  }

  const [updated] = await db
    .update(kanbanTasks)
    .set(updateValues)
    .where(eq(kanbanTasks.taskUuid, taskUuid))
    .returning();

  if (!updated) throw ApiError.internal('Failed to update task');

  emitTeamEvent(agent.teamUuid, canRetry ? 'task:retry' : 'task:dead_letter', {
    taskUuid,
    agentUuid,
    status: updated.status,
    error,
    retryCount: newRetryCount,
    maxRetries: task.maxRetries,
    released: canRetry,
  });

  return {
    taskUuid: updated.taskUuid,
    teamUuid: updated.teamUuid,
    title: updated.title,
    description: updated.description ?? null,
    status: updated.status,
    priority: updated.priority,
    tags: updated.tags,
    assignedAgentUuid: updated.assignedAgentUuid ?? null,
    createdAt: updated.createdAt,
    startedAt: updated.startedAt ?? null,
    retryCount: newRetryCount,
    maxRetries: task.maxRetries,
  };
}

// ── Agent Communication ───────────────────────────────────────────────

export interface AgentMessage {
  messageUuid: string;
  fromAgentUuid: string | null;
  toAgentUuid: string | null;
  messageType: string;
  subject: string | null;
  content: string;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Agent broadcasts a message to all agents in the team.
 */
export async function broadcastMessage(
  db: Database,
  agentUuid: string,
  subject: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<AgentMessage> {
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');


  const [msg] = await db
    .insert(agentMessages)
    .values({
      teamUuid: agent.teamUuid,
      fromAgentUuid: agentUuid,
      messageType: 'broadcast',
      subject,
      content,
      metadata: metadata ?? {},
    })
    .returning();

  if (!msg) throw ApiError.internal('Failed to send message');

  emitTeamEvent(agent.teamUuid, 'message:new', {
    messageUuid: msg.messageUuid,
    fromAgentUuid: agentUuid,
    messageType: 'broadcast',
    subject,
  });

  return {
    messageUuid: msg.messageUuid,
    fromAgentUuid: msg.fromAgentUuid ?? null,
    toAgentUuid: msg.toAgentUuid ?? null,
    messageType: msg.messageType,
    subject: msg.subject ?? null,
    content: msg.content,
    metadata: msg.metadata,
    readAt: msg.readAt ?? null,
    createdAt: msg.createdAt,
  };
}

/**
 * Agent sends a direct message to another agent.
 */
export async function sendDirectMessage(
  db: Database,
  fromAgentUuid: string,
  toAgentUuid: string,
  subject: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<AgentMessage> {
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, fromAgentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');

  // Verify target agent exists and is in the same team
  const [target] = await db
    .select({ teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, toAgentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!target) throw ApiError.notFound('Target agent');
  if (target.teamUuid !== agent.teamUuid) {
    throw ApiError.badRequest('Target agent is not in your team');
  }


  const [msg] = await db
    .insert(agentMessages)
    .values({
      teamUuid: agent.teamUuid,
      fromAgentUuid,
      toAgentUuid,
      messageType: 'direct',
      subject,
      content,
      metadata: metadata ?? {},
    })
    .returning();

  if (!msg) throw ApiError.internal('Failed to send message');

  emitTeamEvent(agent.teamUuid, 'message:new', {
    messageUuid: msg.messageUuid,
    fromAgentUuid,
    toAgentUuid,
    messageType: 'direct',
    subject,
  });

  return {
    messageUuid: msg.messageUuid,
    fromAgentUuid: msg.fromAgentUuid ?? null,
    toAgentUuid: msg.toAgentUuid ?? null,
    messageType: msg.messageType,
    subject: msg.subject ?? null,
    content: msg.content,
    metadata: msg.metadata,
    readAt: msg.readAt ?? null,
    createdAt: msg.createdAt,
  };
}

/**
 * Agent reads unread inbox messages and marks them as read.
 */
export async function readInbox(
  db: Database,
  agentUuid: string,
  markAsRead = false,
  limit = 20,
): Promise<AgentMessage[]> {
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');


  const messages = await db
    .select()
    .from(agentMessages)
    .where(and(
      eq(agentMessages.teamUuid, agent.teamUuid),
      sql`(${agentMessages.toAgentUuid} = ${agentUuid} OR ${agentMessages.messageType} IN ('broadcast', 'system'))`,
      isNull(agentMessages.readAt),
    ))
    .orderBy(desc(agentMessages.createdAt))
    .limit(limit);

  // Mark as read if requested
  if (markAsRead && messages.length > 0) {
    const messageUuids = messages.map(m => m.messageUuid);
    await db
      .update(agentMessages)
      .set({ readAt: new Date() })
      .where(sql`${agentMessages.messageUuid} IN (${sql.join(messageUuids.map(u => sql`${u}`), sql`, `)})`);
  }

  return messages.map(m => ({
    messageUuid: m.messageUuid,
    fromAgentUuid: m.fromAgentUuid ?? null,
    toAgentUuid: m.toAgentUuid ?? null,
    messageType: m.messageType,
    subject: m.subject ?? null,
    content: m.content,
    metadata: m.metadata,
    readAt: m.readAt ?? null,
    createdAt: m.createdAt,
  }));
}

// ── Agent Task Delegation ─────────────────────────────────────────────

export interface DelegateTaskParams {
  title: string;
  description?: string;
  capability: string;
  priority?: string;
  dependsOn?: string[];
  inputMapping?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  maxRetries?: number;
  timeoutMs?: number;
}

/**
 * Agent delegates a subtask to another agent in the team.
 * Creates a new task with the delegating agent as creator and
 * the required capability as a tag for matching.
 */
export async function delegateTask(
  db: Database,
  fromAgentUuid: string,
  params: DelegateTaskParams,
): Promise<AgentTask & { dependsOn: string[]; output: unknown }> {
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, fromAgentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');

  const [created] = await db
    .insert(kanbanTasks)
    .values({
      teamUuid: agent.teamUuid,
      title: params.title,
      description: params.description,
      priority: (params.priority ?? 'medium') as 'low' | 'medium' | 'high' | 'critical',
      tags: [params.capability],
      createdByAgentUuid: fromAgentUuid,
      dependsOn: params.dependsOn ?? [],
      inputMapping: params.inputMapping,
      outputSchema: params.outputSchema,
      maxRetries: params.maxRetries ?? 0,
      timeoutMs: params.timeoutMs,
      status: (params.dependsOn && params.dependsOn.length > 0) ? 'backlog' : 'todo',
    })
    .returning();

  if (!created) throw ApiError.internal('Failed to delegate task');

  emitTeamEvent(agent.teamUuid, 'task:delegated', {
    taskUuid: created.taskUuid,
    fromAgentUuid,
    capability: params.capability,
    dependsOn: params.dependsOn ?? [],
  });

  return {
    taskUuid: created.taskUuid,
    teamUuid: created.teamUuid,
    title: created.title,
    description: created.description ?? null,
    status: created.status,
    priority: created.priority,
    tags: created.tags,
    assignedAgentUuid: created.assignedAgentUuid ?? null,
    createdAt: created.createdAt,
    startedAt: created.startedAt ?? null,
    dependsOn: created.dependsOn,
    output: created.output ?? null,
  };
}

// ── Agent Progress Streaming ──────────────────────────────────────────

/**
 * Agent reports progress on a task — step N/M with optional message.
 * Emits a WebSocket event for real-time UI updates.
 */
export async function updateTaskProgress(
  db: Database,
  agentUuid: string,
  taskUuid: string,
  step: number,
  total: number,
  message?: string,
): Promise<{ taskUuid: string; step: number; total: number; message: string | null }> {
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');

  const [task] = await db
    .select()
    .from(kanbanTasks)
    .where(and(eq(kanbanTasks.taskUuid, taskUuid), eq(kanbanTasks.teamUuid, agent.teamUuid)))
    .limit(1);

  if (!task) throw ApiError.notFound('Task');
  if (task.assignedAgentUuid !== agentUuid) {
    throw ApiError.forbidden('Task is not assigned to you');
  }

  await db
    .update(kanbanTasks)
    .set({
      progressCurrent: step,
      progressTotal: total,
      progressMessage: message ?? null,
      updatedAt: new Date(),
    })
    .where(eq(kanbanTasks.taskUuid, taskUuid));

  emitTeamEvent(agent.teamUuid, 'task:progress', {
    taskUuid,
    agentUuid,
    step,
    total,
    message: message ?? null,
    percent: total > 0 ? Math.round((step / total) * 100) : 0,
  });

  return { taskUuid, step, total, message: message ?? null };
}

// ── Agent Approval Request ────────────────────────────────────────────

/**
 * Agent requests human approval before proceeding with a sensitive operation.
 */
export async function requestApprovalFromAgent(
  db: Database,
  agentUuid: string,
  params: {
    title: string;
    description?: string;
    taskUuid?: string;
    approvers?: string[];
    expiresInMs?: number;
    context?: Record<string, unknown>;
  },
): Promise<unknown> {
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');
  if (!agent.teamUuid) throw ApiError.badRequest('Agent is not assigned to a team');

  const { createApprovalGate } = await import('../approvals/service.js');
  return createApprovalGate(db, {
    teamUuid: agent.teamUuid,
    title: params.title,
    ...(params.description ? { description: params.description } : {}),
    ...(params.taskUuid ? { taskUuid: params.taskUuid } : {}),
    requestedByAgentUuid: agentUuid,
    ...(params.approvers ? { approvers: params.approvers } : {}),
    ...(params.expiresInMs ? { expiresInMs: params.expiresInMs } : {}),
    ...(params.context ? { context: params.context } : {}),
  });
}

// ── Agent Status Reporting ────────────────────────────────────────────

/**
 * Agent reports its own status (online, degraded, offline).
 */
export async function reportStatus(
  db: Database,
  agentUuid: string,
  status: 'online' | 'degraded' | 'offline',
  details?: string,
): Promise<{ agentUuid: string; status: string; updatedAt: Date }> {
  const [updated] = await db
    .update(agents)
    .set({
      status,
      lastHealthCheck: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .returning({ agentUuid: agents.agentUuid, status: agents.status, updatedAt: agents.updatedAt });

  if (!updated) throw ApiError.notFound('Agent');

  return updated;
}
