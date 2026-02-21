import { pgTable, serial, text, varchar, uuid, jsonb, timestamp, pgEnum } from 'drizzle-orm/pg-core';

export const notificationTypeEnum = pgEnum('notification_type', [
  'task_assigned',
  'workflow_completed',
  'workflow_failed',
  'team_invite',
  'agent_offline',
  'message_received',
]);

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  notificationUuid: uuid('notification_uuid').defaultRandom().unique().notNull(),
  userUuid: uuid('user_uuid').notNull(),
  type: notificationTypeEnum('type').notNull(),
  title: varchar('title', { length: 300 }).notNull(),
  body: text('body'),
  metadata: jsonb('metadata'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
