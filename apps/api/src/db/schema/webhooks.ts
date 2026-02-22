import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  jsonb,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Webhooks table — external notification targets.
 * Teams register webhook URLs to receive events when tasks/workflows change.
 */
export const webhooks = pgTable('webhooks', {
  id: serial('id').primaryKey(),
  webhookUuid: uuid('webhook_uuid').defaultRandom().notNull().unique(),
  teamUuid: uuid('team_uuid').notNull(),
  url: varchar('url', { length: 2048 }).notNull(),
  secret: varchar('secret', { length: 255 }).notNull(), // HMAC-SHA256 signing secret
  events: text('events').array().notNull().default([]), // e.g. ['task:completed', 'workflow:failed']
  active: boolean('active').notNull().default(true),
  description: varchar('description', { length: 500 }),
  createdByUserUuid: uuid('created_by_user_uuid').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_webhooks_team_uuid').on(table.teamUuid),
  index('idx_webhooks_active').on(table.active),
]);

export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;

export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', [
  'pending',
  'success',
  'failed',
  'dead_letter',
]);

/**
 * Webhook deliveries — tracks each delivery attempt.
 * Failed deliveries are retried with exponential backoff.
 */
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: serial('id').primaryKey(),
  deliveryUuid: uuid('delivery_uuid').defaultRandom().notNull().unique(),
  webhookUuid: uuid('webhook_uuid').notNull(),
  eventType: varchar('event_type', { length: 255 }).notNull(),
  payload: jsonb('payload').notNull(),
  status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
  responseCode: integer('response_code'),
  responseBody: text('response_body'),
  attempts: integer('attempts').notNull().default(0),
  maxAttempts: integer('max_attempts').notNull().default(5),
  nextRetryAt: timestamp('next_retry_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('idx_webhook_deliveries_webhook_uuid').on(table.webhookUuid),
  index('idx_webhook_deliveries_status').on(table.status),
  index('idx_webhook_deliveries_next_retry').on(table.nextRetryAt),
]);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
