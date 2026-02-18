import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  jsonb,
  pgEnum,
  timestamp,
} from 'drizzle-orm/pg-core';

export const workflowStatusEnum = pgEnum('workflow_status', [
  'queued',
  'in_progress',
  'completed',
  'failed',
]);

/**
 * Workflow runs table — from SRS Section 6.2
 * Each row represents a single execution of a workflow definition.
 */
export const workflowRuns = pgTable('workflow_runs', {
  id: serial('id').primaryKey(),
  workflowRunId: varchar('workflow_run_id', { length: 255 }).notNull().unique(),
  userUuid: uuid('user_uuid').notNull(), // Owner of this workflow run
  workflowName: varchar('workflow_name', { length: 255 }).notNull(),
  workflowDefinition: jsonb('workflow_definition').notNull(), // Full YAML/JSON definition
  input: jsonb('input').notNull(), // Initial user input
  status: workflowStatusEnum('status').notNull().default('queued'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  errorMessage: text('error_message'),
});

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
