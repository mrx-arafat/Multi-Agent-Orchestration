import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  integer,
  pgEnum,
  timestamp,
} from 'drizzle-orm/pg-core';

export const agentStatusEnum = pgEnum('agent_status', ['online', 'degraded', 'offline']);

/**
 * Agents table — from SRS Section 6.1
 * Stores registered agents with their capabilities and health status.
 */
export const agents = pgTable('agents', {
  id: serial('id').primaryKey(),
  agentUuid: uuid('agent_uuid').defaultRandom().notNull().unique(),
  agentId: varchar('agent_id', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  // PostgreSQL text array for capability tags e.g. ["code-audit.javascript", "security-review"]
  capabilities: text('capabilities').array().notNull().default([]),
  endpoint: varchar('endpoint', { length: 2048 }).notNull(),
  authTokenHash: varchar('auth_token_hash', { length: 255 }).notNull(), // Bcrypt hash (for agent-to-MAOF verification)
  authTokenEncrypted: text('auth_token_encrypted'), // AES-256-GCM encrypted (for MAOF-to-agent calls)
  maxConcurrentTasks: integer('max_concurrent_tasks').notNull().default(5),
  description: text('description'),
  status: agentStatusEnum('status').notNull().default('offline'),
  lastHealthCheck: timestamp('last_health_check'),
  // Which user registered this agent (for ownership checks)
  registeredByUserUuid: uuid('registered_by_user_uuid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'), // Soft delete
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
