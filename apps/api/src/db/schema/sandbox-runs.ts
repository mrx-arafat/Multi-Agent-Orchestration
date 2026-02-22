import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const sandboxModeEnum = pgEnum('sandbox_mode', ['dry_run', 'shadow', 'isolated']);
export const sandboxStatusEnum = pgEnum('sandbox_status', ['running', 'completed', 'failed']);

/**
 * Sandbox runs — isolated test executions of workflows.
 * Dry-run: no side effects. Shadow: compare with production. Isolated: sandboxed compute.
 */
export const sandboxRuns = pgTable('sandbox_runs', {
  id: serial('id').primaryKey(),
  sandboxUuid: uuid('sandbox_uuid').defaultRandom().notNull().unique(),
  workflowRunId: varchar('workflow_run_id', { length: 255 }), // Original workflow run (for shadow mode)
  mode: sandboxModeEnum('sandbox_mode').notNull(),
  status: sandboxStatusEnum('sandbox_status').notNull().default('running'),
  workflowDefinition: jsonb('workflow_definition').notNull(),
  input: jsonb('input'),
  // Results
  simulatedOutput: jsonb('simulated_output'), // What would happen
  actualOutput: jsonb('actual_output'), // What actually happened (shadow mode)
  diff: jsonb('diff'), // Differences between simulated and actual
  stageResults: jsonb('stage_results'), // Per-stage dry-run results
  // Metadata
  sideEffectsBlocked: jsonb('side_effects_blocked'), // List of blocked actions
  estimatedCostCents: varchar('estimated_cost_cents', { length: 20 }),
  warnings: text('warnings').array().default([]),
  createdByUserUuid: uuid('created_by_user_uuid').notNull(),
  teamUuid: uuid('team_uuid'),
  sandboxNamespace: varchar('sandbox_namespace', { length: 255 }),
  isolateNetwork: boolean('isolate_network').notNull().default(true),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_sandbox_runs_user').on(table.createdByUserUuid),
  index('idx_sandbox_runs_mode').on(table.mode),
  index('idx_sandbox_runs_status').on(table.status),
  index('idx_sandbox_runs_team_uuid').on(table.teamUuid),
]);

export type SandboxRun = typeof sandboxRuns.$inferSelect;
export type NewSandboxRun = typeof sandboxRuns.$inferInsert;
