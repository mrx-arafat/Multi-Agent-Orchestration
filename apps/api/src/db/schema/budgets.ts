import {
  pgTable,
  serial,
  uuid,
  varchar,
  integer,
  boolean,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const budgetScopeEnum = pgEnum('budget_scope', ['agent', 'workflow', 'team']);
export const budgetActionEnum = pgEnum('budget_action', ['pause', 'notify', 'kill']);
export const budgetPeriodEnum = pgEnum('budget_period', ['daily', 'weekly', 'monthly', 'total']);

/**
 * Budgets table — cost limits with enforcement.
 * Supports per-agent, per-workflow, and per-team budgets.
 */
export const budgets = pgTable('budgets', {
  id: serial('id').primaryKey(),
  budgetUuid: uuid('budget_uuid').defaultRandom().notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  scope: budgetScopeEnum('scope').notNull(),
  scopeUuid: uuid('scope_uuid').notNull(), // Agent, workflow template, or team UUID
  maxCostCents: integer('max_cost_cents').notNull(), // Hard limit in cents
  alertThresholdPercent: integer('alert_threshold_percent').notNull().default(80),
  actionAtLimit: budgetActionEnum('action_at_limit').notNull().default('pause'),
  period: budgetPeriodEnum('period').notNull().default('monthly'),
  currentSpendCents: integer('current_spend_cents').notNull().default(0),
  periodStartAt: timestamp('period_start_at').defaultNow().notNull(),
  isActive: boolean('is_active').notNull().default(true),
  alertSent: boolean('alert_sent').notNull().default(false),
  createdByUserUuid: uuid('created_by_user_uuid').notNull(),
  teamUuid: uuid('team_uuid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_budgets_scope').on(table.scope, table.scopeUuid),
  index('idx_budgets_team_uuid').on(table.teamUuid),
  index('idx_budgets_active').on(table.isActive),
]);

export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
