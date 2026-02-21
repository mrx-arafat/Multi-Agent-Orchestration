/**
 * Notification service — in-app notifications for users.
 * Notifications are created automatically from system events
 * and pushed via WebSocket when the user is connected.
 */
import { eq, and, sql, desc, isNull } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { notifications } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import { emitUserEvent } from '../../lib/event-bus.js';

export interface SafeNotification {
  notificationUuid: string;
  userUuid: string;
  type: string;
  title: string;
  body: string | null;
  metadata: unknown;
  readAt: Date | null;
  createdAt: Date;
}

function toSafe(n: typeof notifications.$inferSelect): SafeNotification {
  return {
    notificationUuid: n.notificationUuid,
    userUuid: n.userUuid,
    type: n.type,
    title: n.title,
    body: n.body ?? null,
    metadata: n.metadata ?? null,
    readAt: n.readAt ?? null,
    createdAt: n.createdAt,
  };
}

export async function createNotification(
  db: Database,
  params: {
    userUuid: string;
    type: 'task_assigned' | 'workflow_completed' | 'workflow_failed' | 'team_invite' | 'agent_offline' | 'message_received';
    title: string;
    body?: string;
    metadata?: unknown;
  },
): Promise<SafeNotification> {
  const [created] = await db
    .insert(notifications)
    .values({
      userUuid: params.userUuid,
      type: params.type,
      title: params.title,
      body: params.body,
      metadata: params.metadata as Record<string, unknown> | undefined,
    })
    .returning();

  if (!created) throw ApiError.internal('Failed to create notification');
  const safe = toSafe(created);

  // Push via WebSocket
  emitUserEvent(params.userUuid, 'notification:new', safe as unknown as Record<string, unknown>);

  return safe;
}

export async function listNotifications(
  db: Database,
  userUuid: string,
  params: {
    unreadOnly?: boolean;
    page?: number;
    limit?: number;
  },
): Promise<{ notifications: SafeNotification[]; meta: { total: number; page: number; limit: number } }> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  const conditions = [eq(notifications.userUuid, userUuid)];
  if (params.unreadOnly) {
    conditions.push(isNull(notifications.readAt));
  }

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.select().from(notifications).where(whereClause)
      .orderBy(desc(notifications.createdAt))
      .limit(limit).offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(notifications).where(whereClause),
  ]);

  return {
    notifications: rows.map(toSafe),
    meta: { total: countResult[0]?.count ?? 0, page, limit },
  };
}

export async function getUnreadCount(
  db: Database,
  userUuid: string,
): Promise<number> {
  const [result] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userUuid, userUuid), isNull(notifications.readAt)));

  return result?.count ?? 0;
}

export async function markRead(
  db: Database,
  notificationUuid: string,
  userUuid: string,
): Promise<SafeNotification> {
  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.notificationUuid, notificationUuid), eq(notifications.userUuid, userUuid)))
    .returning();

  if (!updated) throw ApiError.notFound('Notification');
  return toSafe(updated);
}

export async function markAllRead(
  db: Database,
  userUuid: string,
): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userUuid, userUuid), isNull(notifications.readAt)))
    .returning({ id: notifications.id });

  return result.length;
}
