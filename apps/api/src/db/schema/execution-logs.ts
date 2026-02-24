import {
  pgTable,
  serial,
  varchar,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Execution logs table — from SRS Section 6.2 (FR-5.1)
 * Immutable, append-only audit log of every agent action.
 * Input/output stored as SHA-256 hashes for privacy + integrity.
 */
export const executionLogs = pgTable('execution_logs', {
  id: serial('id').primaryKey(),
  workflowRunId: varchar('workflow_run_id', { length: 255 }).notNull(),
  stageId: varchar('stage_id', { length: 255 }).notNull(),
  agentId: varchar('agent_id', { length: 255 }).notNull(),
  action: varchar('action', { length: 50 }).notNull(), // 'execute' | 'retry' | 'fail'
  inputHash: varchar('input_hash', { length: 255 }), // SHA-256 of input payload
  outputHash: varchar('output_hash', { length: 255 }), // SHA-256 of output payload
  status: varchar('status', { length: 50 }).notNull(),
  // Cryptographic signature — null for MVP, populated in Phase 2
  signature: jsonb('signature'),
  loggedAt: timestamp('logged_at').defaultNow().notNull(),
}, (table) => [
  index('idx_execution_logs_workflow_run_id').on(table.workflowRunId),
  index('idx_execution_logs_stage_id').on(table.stageId),
  index('idx_execution_logs_agent_id').on(table.agentId),
  index('idx_execution_logs_logged_at').on(table.loggedAt),
]);

export type ExecutionLog = typeof executionLogs.$inferSelect;
export type NewExecutionLog = typeof executionLogs.$inferInsert;
