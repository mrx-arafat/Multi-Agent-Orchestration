import type { FastifyInstance } from 'fastify';
import {
  createBudgetSchema,
  checkBudgetSchema,
  updateBudgetSchema,
  deleteBudgetSchema,
  listBudgetsSchema,
} from './schemas.js';
import {
  createBudget,
  checkBudget,
  getBudget,
  listBudgets,
  updateBudget,
  deleteBudget,
} from './service.js';

export async function budgetRoutes(app: FastifyInstance): Promise<void> {
  // Create a budget
  app.post(
    '/budgets',
    { schema: createBudgetSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = request.body as {
        name: string;
        scope: 'agent' | 'workflow' | 'team';
        scopeUuid: string;
        maxCostCents: number;
        alertThresholdPercent?: number;
        actionAtLimit?: 'pause' | 'notify' | 'kill';
        period?: 'daily' | 'weekly' | 'monthly' | 'total';
      };

      const budget = await createBudget(app.db, {
        ...body,
        createdByUserUuid: request.user.sub,
      });

      return reply.status(201).send({ success: true, data: budget });
    },
  );

  // Check budget before executing
  app.get(
    '/budgets/check',
    { schema: checkBudgetSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { scope, scopeUuid, additionalCostCents } = request.query as {
        scope: 'agent' | 'workflow' | 'team';
        scopeUuid: string;
        additionalCostCents?: number;
      };

      const result = await checkBudget(app.db, scope, scopeUuid, additionalCostCents ?? 0);

      if (result === null) {
        return reply.send({
          success: true,
          data: { allowed: true, noBudgetSet: true },
        });
      }

      return reply.send({ success: true, data: result });
    },
  );

  // List budgets
  app.get(
    '/budgets',
    { schema: listBudgetsSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { scope } = request.query as { scope?: 'agent' | 'workflow' | 'team' };
      const budgetList = await listBudgets(app.db, { scope });
      return reply.send({ success: true, data: { budgets: budgetList, count: budgetList.length } });
    },
  );

  // Get a specific budget
  app.get(
    '/budgets/:budgetUuid',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { budgetUuid } = request.params as { budgetUuid: string };
      const budget = await getBudget(app.db, budgetUuid);
      return reply.send({ success: true, data: budget });
    },
  );

  // Update a budget
  app.patch(
    '/budgets/:budgetUuid',
    { schema: updateBudgetSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { budgetUuid } = request.params as { budgetUuid: string };
      const body = request.body as Partial<{
        name: string;
        maxCostCents: number;
        alertThresholdPercent: number;
        actionAtLimit: 'pause' | 'notify' | 'kill';
        isActive: boolean;
      }>;

      const updated = await updateBudget(app.db, budgetUuid, body);
      return reply.send({ success: true, data: updated });
    },
  );

  // Delete a budget
  app.delete(
    '/budgets/:budgetUuid',
    { schema: deleteBudgetSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { budgetUuid } = request.params as { budgetUuid: string };
      await deleteBudget(app.db, budgetUuid);
      return reply.send({ success: true, data: { deleted: true } });
    },
  );
}
