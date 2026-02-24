import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const agentStatusEnum = pgEnum('agent_status', ['online', 'degraded', 'offline']);
export const agentTypeEnum = pgEnum('agent_type', ['generic', 'openclaw', 'builtin']);

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
  agentType: agentTypeEnum('agent_type').notNull().default('generic'), // 'generic' or 'openclaw'
  teamUuid: uuid('team_uuid'), // Team this agent belongs to (null = unassigned)
  status: agentStatusEnum('status').notNull().default('offline'),
  lastHealthCheck: timestamp('last_health_check'),
  // Phase 10: Persistent WebSocket connections
  wsConnected: boolean('ws_connected').notNull().default(false),
  lastHeartbeat: timestamp('last_heartbeat'),
  // Which user registered this agent (for ownership checks)
  registeredByUserUuid: uuid('registered_by_user_uuid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'), // Soft delete
}, (table) => [
  index('idx_agents_team_uuid').on(table.teamUuid),
  index('idx_agents_status').on(table.status),
  index('idx_agents_deleted_at').on(table.deletedAt),
  index('idx_agents_registered_by').on(table.registeredByUserUuid),
]);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
