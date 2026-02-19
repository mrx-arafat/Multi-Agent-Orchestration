import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  integer,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const kanbanStatusEnum = pgEnum('kanban_status', [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'done',
]);

export const kanbanPriorityEnum = pgEnum('kanban_priority', [
  'low',
  'medium',
  'high',
  'critical',
]);

/**
 * Kanban tasks table — agent-managed task board.
 * Each workflow run acts as a "board". Agents claim tasks, update status,
 * and complete them. Tags enable capability-based task routing.
 */
export const kanbanTasks = pgTable('kanban_tasks', {
  id: serial('id').primaryKey(),
  taskUuid: uuid('task_uuid').defaultRandom().notNull().unique(),
  teamUuid: uuid('team_uuid').notNull(), // Team scope — isolation boundary
  workflowRunId: varchar('workflow_run_id', { length: 255 }), // Optional workflow link
  title: varchar('title', { length: 500 }).notNull(),
  description: text('description'),
  status: kanbanStatusEnum('status').notNull().default('backlog'),
  priority: kanbanPriorityEnum('priority').notNull().default('medium'),
  tags: text('tags').array().notNull().default([]), // Capability/category tags
  assignedAgentUuid: uuid('assigned_agent_uuid'), // Agent currently working on this
  createdByAgentUuid: uuid('created_by_agent_uuid'), // Agent that created this task
  createdByUserUuid: uuid('created_by_user_uuid'), // User that created this (if manual)
  parentTaskUuid: uuid('parent_task_uuid'), // For subtask hierarchies
  stageId: varchar('stage_id', { length: 255 }), // Link to workflow stage (optional)
  estimatedMs: integer('estimated_ms'), // Estimated time to complete
  actualMs: integer('actual_ms'), // Actual time taken
  result: text('result'), // Output/result when done
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
}, (table) => [
  index('idx_kanban_tasks_team_uuid').on(table.teamUuid),
  index('idx_kanban_tasks_status').on(table.status),
  index('idx_kanban_tasks_assigned_agent').on(table.assignedAgentUuid),
]);

export type KanbanTask = typeof kanbanTasks.$inferSelect;
export type NewKanbanTask = typeof kanbanTasks.$inferInsert;
