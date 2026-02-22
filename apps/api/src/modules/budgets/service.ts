/**
 * Budget Enforcement service — hard cost limits with auto-throttling.
 * Supports per-agent, per-workflow, and per-team budgets.
 */
import { eq, and, sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { budgets, type NewBudget } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

export interface CreateBudgetParams {
  name: string;
  scope: 'agent' | 'workflow' | 'team';
  scopeUuid: string;
  maxCostCents: number;
  alertThresholdPercent?: number;
  actionAtLimit?: 'pause' | 'notify' | 'kill';
  period?: 'daily' | 'weekly' | 'monthly' | 'total';
  createdByUserUuid: string;
  teamUuid?: string;
}

export interface BudgetCheckResult {
  allowed: boolean;
  budgetUuid: string;
  currentSpendCents: number;
  maxCostCents: number;
  usagePercent: number;
  action?: 'pause' | 'notify' | 'kill';
  reason?: string;
}

/**
 * Create a new budget.
 */
export async function createBudget(
  db: Database,
  params: CreateBudgetParams,
): Promise<typeof budgets.$inferSelect> {
  const values: NewBudget = {
    name: params.name,
    scope: params.scope,
    scopeUuid: params.scopeUuid,
    maxCostCents: params.maxCostCents,
    alertThresholdPercent: params.alertThresholdPercent ?? 80,
    actionAtLimit: params.actionAtLimit ?? 'pause',
    period: params.period ?? 'monthly',
    createdByUserUuid: params.createdByUserUuid,
    teamUuid: params.teamUuid,
  };

  const [budget] = await db.insert(budgets).values(values).returning();
  if (!budget) throw ApiError.internal('Failed to create budget');
  return budget;
}

/**
 * Check if a cost is within budget. Returns whether the operation is allowed.
 */
export async function checkBudget(
  db: Database,
  scope: 'agent' | 'workflow' | 'team',
  scopeUuid: string,
  additionalCostCents: number = 0,
): Promise<BudgetCheckResult | null> {
  const [budget] = await db.select().from(budgets)
    .where(and(
      eq(budgets.scope, scope),
      eq(budgets.scopeUuid, scopeUuid),
      eq(budgets.isActive, true),
    ))
    .limit(1);

  if (!budget) return null; // No budget set, allow

  // Check if period needs resetting
  const now = new Date();
  const periodStart = budget.periodStartAt;
  let needsReset = false;

  if (budget.period === 'daily') {
    needsReset = now.getTime() - periodStart.getTime() > 86400000;
  } else if (budget.period === 'weekly') {
    needsReset = now.getTime() - periodStart.getTime() > 604800000;
  } else if (budget.period === 'monthly') {
    needsReset = now.getMonth() !== periodStart.getMonth() || now.getFullYear() !== periodStart.getFullYear();
  }

  if (needsReset && budget.period !== 'total') {
    await db.update(budgets)
      .set({ currentSpendCents: 0, periodStartAt: now, alertSent: false })
      .where(eq(budgets.id, budget.id));
    budget.currentSpendCents = 0;
    budget.alertSent = false;
  }

  const projectedSpend = budget.currentSpendCents + additionalCostCents;
  const usagePercent = Math.round((projectedSpend / budget.maxCostCents) * 100);

  if (projectedSpend > budget.maxCostCents) {
    return {
      allowed: false,
      budgetUuid: budget.budgetUuid,
      currentSpendCents: budget.currentSpendCents,
      maxCostCents: budget.maxCostCents,
      usagePercent,
      action: budget.actionAtLimit,
      reason: `Budget exceeded: ${projectedSpend} cents > ${budget.maxCostCents} cents limit`,
    };
  }

  return {
    allowed: true,
    budgetUuid: budget.budgetUuid,
    currentSpendCents: budget.currentSpendCents,
    maxCostCents: budget.maxCostCents,
    usagePercent,
  };
}

/**
 * Record spend against a budget.
 */
export async function recordSpend(
  db: Database,
  scope: 'agent' | 'workflow' | 'team',
  scopeUuid: string,
  costCents: number,
): Promise<{ budgetUuid: string; newTotal: number; alertTriggered: boolean } | null> {
  const [budget] = await db.select().from(budgets)
    .where(and(
      eq(budgets.scope, scope),
      eq(budgets.scopeUuid, scopeUuid),
      eq(budgets.isActive, true),
    ))
    .limit(1);

  if (!budget) return null;

  const newTotal = budget.currentSpendCents + costCents;
  const usagePercent = Math.round((newTotal / budget.maxCostCents) * 100);
  const alertTriggered = !budget.alertSent && usagePercent >= budget.alertThresholdPercent;

  await db.update(budgets)
    .set({
      currentSpendCents: newTotal,
      alertSent: alertTriggered ? true : budget.alertSent,
      updatedAt: new Date(),
    })
    .where(eq(budgets.id, budget.id));

  return { budgetUuid: budget.budgetUuid, newTotal, alertTriggered };
}

/**
 * Get budget by UUID.
 */
export async function getBudget(
  db: Database,
  budgetUuid: string,
): Promise<typeof budgets.$inferSelect> {
  const [budget] = await db.select().from(budgets)
    .where(eq(budgets.budgetUuid, budgetUuid))
    .limit(1);

  if (!budget) throw ApiError.notFound('Budget');
  return budget;
}

/**
 * List budgets, optionally filtered by scope.
 */
export async function listBudgets(
  db: Database,
  filters?: { scope?: 'agent' | 'workflow' | 'team' | undefined; teamUuid?: string | undefined } | undefined,
): Promise<typeof budgets.$inferSelect[]> {
  const conditions = [];
  if (filters?.scope) conditions.push(eq(budgets.scope, filters.scope));
  if (filters?.teamUuid) conditions.push(eq(budgets.teamUuid, filters.teamUuid));

  if (conditions.length === 0) {
    return db.select().from(budgets).orderBy(budgets.createdAt);
  }
  return db.select().from(budgets).where(and(...conditions)).orderBy(budgets.createdAt);
}

/**
 * Update a budget.
 */
export async function updateBudget(
  db: Database,
  budgetUuid: string,
  updates: Partial<Pick<typeof budgets.$inferSelect, 'name' | 'maxCostCents' | 'alertThresholdPercent' | 'actionAtLimit' | 'isActive'>>,
): Promise<typeof budgets.$inferSelect> {
  const [updated] = await db.update(budgets)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(budgets.budgetUuid, budgetUuid))
    .returning();

  if (!updated) throw ApiError.notFound('Budget');
  return updated;
}

/**
 * Delete a budget.
 */
export async function deleteBudget(
  db: Database,
  budgetUuid: string,
): Promise<void> {
  const result = await db.delete(budgets)
    .where(eq(budgets.budgetUuid, budgetUuid))
    .returning();

  if (result.length === 0) throw ApiError.notFound('Budget');
}
