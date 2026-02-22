/**
 * Approval Gates Service — human-in-the-loop approval for sensitive operations.
 *
 * Agents or workflows can request approval before proceeding.
 * Approvers are notified via WebSocket and can approve/reject via API.
 * Gates expire automatically if no response within the timeout.
 */
import { eq, and, sql, desc } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { approvalGates } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import { emitTeamEvent, emitUserEvent } from '../../lib/event-bus.js';

export interface CreateApprovalParams {
  teamUuid: string;
  title: string;
  description?: string;
  taskUuid?: string;
  workflowRunId?: string;
  stageId?: string;
  requestedByAgentUuid?: string;
  requestedByUserUuid?: string;
  approvers?: string[];
  expiresInMs?: number;
  context?: Record<string, unknown>;
}

export interface SafeApprovalGate {
  gateUuid: string;
  teamUuid: string;
  taskUuid: string | null;
  workflowRunId: string | null;
  stageId: string | null;
  title: string;
  description: string | null;
  status: string;
  requestedByAgentUuid: string | null;
  requestedByUserUuid: string | null;
  approvers: string[];
  respondedByUserUuid: string | null;
  responseNote: string | null;
  expiresAt: Date | null;
  context: unknown;
  createdAt: Date;
  respondedAt: Date | null;
}

function toSafe(row: typeof approvalGates.$inferSelect): SafeApprovalGate {
  return {
    gateUuid: row.gateUuid,
    teamUuid: row.teamUuid,
    taskUuid: row.taskUuid,
    workflowRunId: row.workflowRunId,
    stageId: row.stageId,
    title: row.title,
    description: row.description,
    status: row.status,
    requestedByAgentUuid: row.requestedByAgentUuid,
    requestedByUserUuid: row.requestedByUserUuid,
    approvers: row.approvers,
    respondedByUserUuid: row.respondedByUserUuid,
    responseNote: row.responseNote,
    expiresAt: row.expiresAt,
    context: row.context,
    createdAt: row.createdAt,
    respondedAt: row.respondedAt,
  };
}

/**
 * Create an approval gate. Notifies team members and specific approvers via WebSocket.
 */
export async function createApprovalGate(
  db: Database,
  params: CreateApprovalParams,
): Promise<SafeApprovalGate> {
  const expiresAt = params.expiresInMs
    ? new Date(Date.now() + params.expiresInMs)
    : null;

  const [gate] = await db
    .insert(approvalGates)
    .values({
      teamUuid: params.teamUuid,
      title: params.title,
      description: params.description,
      taskUuid: params.taskUuid,
      workflowRunId: params.workflowRunId,
      stageId: params.stageId,
      requestedByAgentUuid: params.requestedByAgentUuid,
      requestedByUserUuid: params.requestedByUserUuid,
      approvers: params.approvers ?? [],
      expiresAt,
      context: params.context,
    })
    .returning();

  if (!gate) throw ApiError.internal('Failed to create approval gate');

  // Notify team via WebSocket
  emitTeamEvent(params.teamUuid, 'approval:requested', {
    gateUuid: gate.gateUuid,
    title: params.title,
    description: params.description ?? null,
    taskUuid: params.taskUuid ?? null,
    workflowRunId: params.workflowRunId ?? null,
    stageId: params.stageId ?? null,
    expiresAt: expiresAt?.toISOString() ?? null,
    approvers: params.approvers ?? [],
  });

  // Notify specific approvers via user channel
  for (const approverUuid of params.approvers ?? []) {
    emitUserEvent(approverUuid, 'approval:requested', {
      gateUuid: gate.gateUuid,
      title: params.title,
      teamUuid: params.teamUuid,
    });
  }

  return toSafe(gate);
}

/**
 * List approval gates for a team, optionally filtered by status.
 */
export async function listApprovalGates(
  db: Database,
  teamUuid: string,
  status?: string,
): Promise<SafeApprovalGate[]> {
  const conditions = [eq(approvalGates.teamUuid, teamUuid)];
  if (status) {
    conditions.push(
      sql`${approvalGates.status} = ${status}` as ReturnType<typeof eq>,
    );
  }

  const rows = await db
    .select()
    .from(approvalGates)
    .where(and(...conditions))
    .orderBy(desc(approvalGates.createdAt))
    .limit(100);

  return rows.map(toSafe);
}

/**
 * Get a single approval gate by UUID.
 */
export async function getApprovalGate(
  db: Database,
  gateUuid: string,
): Promise<SafeApprovalGate> {
  const [gate] = await db
    .select()
    .from(approvalGates)
    .where(eq(approvalGates.gateUuid, gateUuid))
    .limit(1);

  if (!gate) throw ApiError.notFound('Approval gate');
  return toSafe(gate);
}

/**
 * Respond to an approval gate — approve or reject.
 */
export async function respondToApproval(
  db: Database,
  gateUuid: string,
  userUuid: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<SafeApprovalGate> {
  const [gate] = await db
    .select()
    .from(approvalGates)
    .where(eq(approvalGates.gateUuid, gateUuid))
    .limit(1);

  if (!gate) throw ApiError.notFound('Approval gate');
  if (gate.status !== 'pending') {
    throw ApiError.conflict(`Gate already ${gate.status}`);
  }

  // Check expiry
  if (gate.expiresAt && gate.expiresAt < new Date()) {
    await db
      .update(approvalGates)
      .set({ status: 'expired', respondedAt: new Date() })
      .where(eq(approvalGates.gateUuid, gateUuid));
    throw ApiError.conflict('Approval gate has expired');
  }

  // Check if user is an authorized approver (empty list = any team member can approve)
  if (gate.approvers.length > 0 && !gate.approvers.includes(userUuid)) {
    throw ApiError.forbidden('You are not an authorized approver for this gate');
  }

  const [updated] = await db
    .update(approvalGates)
    .set({
      status: decision,
      respondedByUserUuid: userUuid,
      responseNote: note,
      respondedAt: new Date(),
    })
    .where(eq(approvalGates.gateUuid, gateUuid))
    .returning();

  if (!updated) throw ApiError.internal('Failed to update approval gate');

  // Notify team
  emitTeamEvent(gate.teamUuid, `approval:${decision}`, {
    gateUuid: gate.gateUuid,
    title: gate.title,
    taskUuid: gate.taskUuid,
    workflowRunId: gate.workflowRunId,
    stageId: gate.stageId,
    respondedByUserUuid: userUuid,
    note: note ?? null,
  });

  return toSafe(updated);
}

/**
 * Expire all pending approval gates past their expiry time.
 * Called periodically by a background timer.
 */
export async function expireStaleApprovals(db: Database): Promise<number> {
  const result = await db
    .update(approvalGates)
    .set({ status: 'expired', respondedAt: new Date() })
    .where(and(
      eq(approvalGates.status, 'pending'),
      sql`${approvalGates.expiresAt} IS NOT NULL AND ${approvalGates.expiresAt} < NOW()`,
    ))
    .returning({ gateUuid: approvalGates.gateUuid, teamUuid: approvalGates.teamUuid, title: approvalGates.title });

  for (const gate of result) {
    emitTeamEvent(gate.teamUuid, 'approval:expired', {
      gateUuid: gate.gateUuid,
      title: gate.title,
    });
  }

  return result.length;
}
