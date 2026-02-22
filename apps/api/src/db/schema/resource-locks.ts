import {
  pgTable,
  serial,
  uuid,
  varchar,
  integer,
  text,
  jsonb,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const lockStatusEnum = pgEnum('lock_status', ['active', 'released', 'expired']);
export const conflictStrategyEnum = pgEnum('conflict_strategy', ['fail', 'queue', 'merge', 'escalate']);

/**
 * Resource locks — optimistic locking for multi-agent conflict resolution.
 * Prevents race conditions when agents modify shared resources.
 */
export const resourceLocks = pgTable('resource_locks', {
  id: serial('id').primaryKey(),
  lockUuid: uuid('lock_uuid').defaultRandom().notNull().unique(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(), // e.g., 'file', 'database', 'api'
  resourceId: varchar('resource_id', { length: 500 }).notNull(), // e.g., 'src/index.ts', 'users.123'
  ownerAgentUuid: uuid('owner_agent_uuid').notNull(),
  ownerWorkflowRunId: varchar('owner_workflow_run_id', { length: 255 }),
  version: integer('version').notNull().default(1), // Optimistic lock version
  contentHash: varchar('content_hash', { length: 128 }), // SHA-256 hash of resource content
  conflictStrategy: conflictStrategyEnum('conflict_strategy').notNull().default('fail'),
  status: lockStatusEnum('lock_status').notNull().default('active'),
  metadata: jsonb('metadata'),
  acquiredAt: timestamp('acquired_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(), // Locks must expire
  releasedAt: timestamp('released_at'),
  teamUuid: uuid('team_uuid'),
}, (table) => [
  index('idx_resource_locks_resource').on(table.resourceType, table.resourceId),
  index('idx_resource_locks_owner').on(table.ownerAgentUuid),
  index('idx_resource_locks_status').on(table.status),
  index('idx_resource_locks_expires').on(table.expiresAt),
]);

export type ResourceLock = typeof resourceLocks.$inferSelect;
export type NewResourceLock = typeof resourceLocks.$inferInsert;
