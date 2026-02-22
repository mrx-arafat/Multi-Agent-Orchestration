/**
 * Approval Gates — human-in-the-loop approval for sensitive agent operations.
 * When a workflow stage or task requires approval, an approval request is created.
 * Approvers receive WebSocket notifications and can approve/reject from the dashboard or bot.
 */
import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  jsonb,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const approvalStatusEnum = pgEnum('approval_status', [
  'pending',
  'approved',
  'rejected',
  'expired',
]);

export const approvalGates = pgTable('approval_gates', {
  id: serial('id').primaryKey(),
  gateUuid: uuid('gate_uuid').defaultRandom().notNull().unique(),
  teamUuid: uuid('team_uuid').notNull(),

  // What needs approval
  taskUuid: uuid('task_uuid'),                              // Kanban task (optional)
  workflowRunId: varchar('workflow_run_id', { length: 255 }), // Workflow run (optional)
  stageId: varchar('stage_id', { length: 255 }),            // Workflow stage (optional)

  // Approval details
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: approvalStatusEnum('status').notNull().default('pending'),
  requestedByAgentUuid: uuid('requested_by_agent_uuid'),    // Agent that triggered the gate
  requestedByUserUuid: uuid('requested_by_user_uuid'),      // User that triggered the gate

  // Who can approve (array of user UUIDs or email patterns)
  approvers: text('approvers').array().notNull().default([]),
  // Who actually responded
  respondedByUserUuid: uuid('responded_by_user_uuid'),
  responseNote: text('response_note'),

  // Timeout — auto-reject/expire after this time
  expiresAt: timestamp('expires_at'),

  // Context data passed to the approver for decision making
  context: jsonb('context'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
  respondedAt: timestamp('responded_at'),
}, (table) => [
  index('idx_approval_gates_team_uuid').on(table.teamUuid),
  index('idx_approval_gates_status').on(table.status),
  index('idx_approval_gates_task_uuid').on(table.taskUuid),
  index('idx_approval_gates_workflow_run_id').on(table.workflowRunId),
]);

export type ApprovalGate = typeof approvalGates.$inferSelect;
export type NewApprovalGate = typeof approvalGates.$inferInsert;
