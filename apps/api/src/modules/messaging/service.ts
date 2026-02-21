/**
 * Agent messaging service — inter-agent communication within a team.
 * Agents can send direct messages, broadcast to the team, or receive system messages.
 * All messages are scoped to a team (isolation boundary).
 */
import { eq, and, isNull, sql, desc, or } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { agentMessages, agents } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import { emitTeamEvent } from '../../lib/event-bus.js';

export interface SafeMessage {
  messageUuid: string;
  teamUuid: string;
  workflowRunId: string | null;
  fromAgentUuid: string | null;
  toAgentUuid: string | null;
  messageType: string;
  subject: string | null;
  content: string;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}

function toSafe(msg: typeof agentMessages.$inferSelect): SafeMessage {
  return {
    messageUuid: msg.messageUuid,
    teamUuid: msg.teamUuid,
    workflowRunId: msg.workflowRunId ?? null,
    fromAgentUuid: msg.fromAgentUuid ?? null,
    toAgentUuid: msg.toAgentUuid ?? null,
    messageType: msg.messageType,
    subject: msg.subject ?? null,
    content: msg.content,
    metadata: msg.metadata ?? null,
    readAt: msg.readAt ?? null,
    createdAt: msg.createdAt,
  };
}

/**
 * Sends a direct message from one agent to another within the same team.
 */
export async function sendMessage(
  db: Database,
  params: {
    teamUuid: string;
    fromAgentUuid: string;
    toAgentUuid?: string;
    messageType?: string;
    subject?: string;
    content: string;
    metadata?: unknown;
    workflowRunId?: string;
  },
): Promise<SafeMessage> {
  // Verify sender belongs to this team
  const [sender] = await db
    .select({ agentUuid: agents.agentUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, params.fromAgentUuid), eq(agents.teamUuid, params.teamUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!sender) {
    throw ApiError.forbidden('Sender agent is not a member of this team');
  }

  const messageType = params.messageType ?? 'direct';

  // For direct messages, verify recipient is in the same team
  if (messageType === 'direct' && params.toAgentUuid) {
    const [recipient] = await db
      .select({ agentUuid: agents.agentUuid })
      .from(agents)
      .where(and(eq(agents.agentUuid, params.toAgentUuid), eq(agents.teamUuid, params.teamUuid), isNull(agents.deletedAt)))
      .limit(1);

    if (!recipient) {
      throw ApiError.notFound('Recipient agent not found in this team');
    }
  }

  if (messageType === 'direct' && !params.toAgentUuid) {
    throw ApiError.badRequest('Direct messages require a toAgentUuid');
  }

  const [created] = await db
    .insert(agentMessages)
    .values({
      teamUuid: params.teamUuid,
      fromAgentUuid: params.fromAgentUuid,
      toAgentUuid: params.toAgentUuid,
      messageType: messageType as 'direct' | 'broadcast' | 'system',
      subject: params.subject,
      content: params.content,
      metadata: params.metadata,
      workflowRunId: params.workflowRunId,
    })
    .returning();

  if (!created) throw ApiError.internal('Failed to send message');
  const safe = toSafe(created);
  emitTeamEvent(params.teamUuid, 'message:new', safe as unknown as Record<string, unknown>);
  return safe;
}

/**
 * Lists messages for an agent in a team (inbox).
 * Returns messages sent TO this agent (direct) or broadcast to the team.
 */
export async function listMessages(
  db: Database,
  teamUuid: string,
  agentUuid: string,
  params: {
    messageType?: string;
    unreadOnly?: boolean;
    page?: number;
    limit?: number;
  },
): Promise<{ messages: SafeMessage[]; meta: { total: number; page: number; limit: number } }> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [
    eq(agentMessages.teamUuid, teamUuid),
    or(
      eq(agentMessages.toAgentUuid, agentUuid),      // Direct messages to this agent
      eq(agentMessages.messageType, 'broadcast'),      // All broadcasts in the team
      eq(agentMessages.messageType, 'system'),          // All system messages
    ),
  ];

  if (params.messageType) {
    conditions.push(eq(agentMessages.messageType, params.messageType as 'direct' | 'broadcast' | 'system'));
  }
  if (params.unreadOnly) {
    conditions.push(sql`${agentMessages.readAt} IS NULL`);
  }

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.select().from(agentMessages).where(whereClause)
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(agentMessages).where(whereClause),
  ]);

  return {
    messages: rows.map(toSafe),
    meta: { total: countResult[0]?.count ?? 0, page, limit },
  };
}

/**
 * Lists all messages in a team's conversation thread (team-wide view).
 */
export async function listTeamMessages(
  db: Database,
  teamUuid: string,
  params: {
    workflowRunId?: string;
    page?: number;
    limit?: number;
  },
): Promise<{ messages: SafeMessage[]; meta: { total: number; page: number; limit: number } }> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [eq(agentMessages.teamUuid, teamUuid)];

  if (params.workflowRunId) {
    conditions.push(eq(agentMessages.workflowRunId, params.workflowRunId));
  }

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.select().from(agentMessages).where(whereClause)
      .orderBy(desc(agentMessages.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(agentMessages).where(whereClause),
  ]);

  return {
    messages: rows.map(toSafe),
    meta: { total: countResult[0]?.count ?? 0, page, limit },
  };
}

/**
 * Marks a message as read by the recipient agent.
 */
export async function markMessageRead(
  db: Database,
  messageUuid: string,
  teamUuid: string,
): Promise<SafeMessage> {
  const [updated] = await db
    .update(agentMessages)
    .set({ readAt: new Date() })
    .where(and(eq(agentMessages.messageUuid, messageUuid), eq(agentMessages.teamUuid, teamUuid)))
    .returning();

  if (!updated) throw ApiError.notFound('Message');
  return toSafe(updated);
}
