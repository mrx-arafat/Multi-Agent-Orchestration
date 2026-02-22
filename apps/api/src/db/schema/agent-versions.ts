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

export const deploymentStrategyEnum = pgEnum('deployment_strategy', [
  'direct',   // Instant switch
  'canary',   // Percentage-based rollout
  'blue_green', // Full swap
]);

export const versionStatusEnum = pgEnum('version_status', [
  'draft',    // Not yet deployed
  'active',   // Currently receiving traffic
  'canary',   // Receiving partial traffic
  'inactive', // Healthy but not serving
  'rolled_back', // Was rolled back due to errors
]);

/**
 * Agent versions — immutable snapshots of agent configurations.
 * Supports canary deployments, rollback, and blue/green switching.
 */
export const agentVersions = pgTable('agent_versions', {
  id: serial('id').primaryKey(),
  versionUuid: uuid('version_uuid').defaultRandom().notNull().unique(),
  agentUuid: uuid('agent_uuid').notNull(),
  version: varchar('version', { length: 50 }).notNull(), // Semver: "1.0.0"
  endpoint: varchar('endpoint', { length: 2048 }).notNull(),
  capabilities: text('capabilities').array().notNull().default([]),
  config: jsonb('config'), // Version-specific configuration
  status: versionStatusEnum('version_status').notNull().default('draft'),
  deploymentStrategy: deploymentStrategyEnum('deployment_strategy').notNull().default('direct'),
  trafficPercent: integer('traffic_percent').notNull().default(0), // 0-100
  errorRate: integer('error_rate').notNull().default(0), // Errors per 1000 requests
  errorThreshold: integer('error_threshold').notNull().default(50), // Auto-rollback threshold (per 1000)
  totalRequests: integer('total_requests').notNull().default(0),
  totalErrors: integer('total_errors').notNull().default(0),
  isRollbackTarget: boolean('is_rollback_target').notNull().default(false), // Safe version to rollback to
  releaseNotes: text('release_notes'),
  createdByUserUuid: uuid('created_by_user_uuid').notNull(),
  promotedAt: timestamp('promoted_at'),
  rolledBackAt: timestamp('rolled_back_at'),
  teamUuid: uuid('team_uuid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_agent_versions_agent_uuid').on(table.agentUuid),
  index('idx_agent_versions_status').on(table.status),
  index('idx_agent_versions_version').on(table.agentUuid, table.version),
]);

export type AgentVersion = typeof agentVersions.$inferSelect;
export type NewAgentVersion = typeof agentVersions.$inferInsert;
