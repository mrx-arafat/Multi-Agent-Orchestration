import {
  pgTable,
  serial,
  uuid,
  varchar,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Task metrics table — cost and performance tracking per task execution.
 * Records token usage, cost attribution, and latency for observability.
 */
export const taskMetrics = pgTable('task_metrics', {
  id: serial('id').primaryKey(),
  metricUuid: uuid('metric_uuid').defaultRandom().notNull().unique(),
  taskUuid: uuid('task_uuid'), // Kanban task (nullable for workflow-only metrics)
  workflowRunId: varchar('workflow_run_id', { length: 255 }), // Workflow run link
  stageId: varchar('stage_id', { length: 255 }), // Stage within workflow
  agentUuid: uuid('agent_uuid'), // Agent that executed
  agentId: varchar('agent_id', { length: 255 }), // Agent string ID
  teamUuid: uuid('team_uuid'), // Team scope for aggregation

  // Cost metrics
  tokensUsed: integer('tokens_used').notNull().default(0),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  costCents: integer('cost_cents').notNull().default(0), // Cost in cents (integer for precision)

  // Performance metrics
  latencyMs: integer('latency_ms').notNull().default(0),
  queueWaitMs: integer('queue_wait_ms'), // Time spent waiting in queue

  // Metadata
  provider: varchar('provider', { length: 50 }), // 'openai', 'anthropic', 'google'
  model: varchar('model', { length: 100 }), // 'gpt-4o', 'claude-3-sonnet', etc.
  capability: varchar('capability', { length: 255 }), // 'code.review', 'text.summarize'
  metadata: jsonb('metadata'), // Additional context

  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_task_metrics_task_uuid').on(table.taskUuid),
  index('idx_task_metrics_agent_uuid').on(table.agentUuid),
  index('idx_task_metrics_team_uuid').on(table.teamUuid),
  index('idx_task_metrics_workflow_run_id').on(table.workflowRunId),
  index('idx_task_metrics_created_at').on(table.createdAt),
]);

export type TaskMetric = typeof taskMetrics.$inferSelect;
export type NewTaskMetric = typeof taskMetrics.$inferInsert;
