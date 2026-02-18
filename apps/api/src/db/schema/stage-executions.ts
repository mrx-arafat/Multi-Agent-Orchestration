import {
  pgTable,
  serial,
  varchar,
  integer,
  jsonb,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const stageStatusEnum = pgEnum('stage_status', [
  'queued',
  'in_progress',
  'completed',
  'failed',
]);

/**
 * Stage executions table — from SRS Section 6.2
 * Each row records the execution of a single stage within a workflow run.
 */
export const stageExecutions = pgTable('stage_executions', {
  id: serial('id').primaryKey(),
  workflowRunId: varchar('workflow_run_id', { length: 255 }).notNull(),
  stageId: varchar('stage_id', { length: 255 }).notNull(),
  agentId: varchar('agent_id', { length: 255 }).notNull(),
  status: stageStatusEnum('status').notNull().default('queued'),
  input: jsonb('input'),
  output: jsonb('output'),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  executionTimeMs: integer('execution_time_ms'),
  errorMessage: varchar('error_message', { length: 2048 }),
}, (table) => [
  index('idx_stage_executions_workflow_run_id').on(table.workflowRunId),
]);

export type StageExecution = typeof stageExecutions.$inferSelect;
export type NewStageExecution = typeof stageExecutions.$inferInsert;
