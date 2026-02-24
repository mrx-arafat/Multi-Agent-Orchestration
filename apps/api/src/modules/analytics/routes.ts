/**
 * Analytics routes — team-scoped metrics and dashboard data.
 *
 * GET /analytics/teams/:teamUuid/tasks       — Task completion metrics
 * GET /analytics/teams/:teamUuid/agents      — Agent utilization
 * GET /analytics/teams/:teamUuid/overview     — Overview stats
 * GET /analytics/teams/:teamUuid/timeseries   — Time-series data
 * GET /analytics/workflows                    — Workflow success metrics
 */
import type { FastifyInstance } from 'fastify';
import {
  getTaskCompletionMetrics,
  getAgentUtilization,
  getWorkflowMetrics,
  getTimeSeries,
  getOverviewStats,
} from './service.js';
import { teamUuidParam, dateRangeQuery } from '../../lib/schema-utils.js';

const teamParamSchema = { params: teamUuidParam } as const;
const dateRangeQuerySchema = { querystring: dateRangeQuery } as const;

export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /analytics/teams/:teamUuid/tasks
   * Task completion rates, by status, by priority.
   */
  app.get(
    '/analytics/teams/:teamUuid/tasks',
    {
      schema: { ...teamParamSchema, ...dateRangeQuerySchema },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const { dateStart, dateEnd } = request.query as { dateStart?: string; dateEnd?: string };
      const result = await getTaskCompletionMetrics(app.db, teamUuid, dateStart, dateEnd);
      return reply.send({ success: true, data: result });
    },
  );

  /**
   * GET /analytics/teams/:teamUuid/agents
   * Agent utilization: tasks assigned/completed, stages executed, avg time.
   */
  app.get(
    '/analytics/teams/:teamUuid/agents',
    {
      schema: teamParamSchema,
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const result = await getAgentUtilization(app.db, teamUuid);
      return reply.send({ success: true, data: result });
    },
  );

  /**
   * GET /analytics/teams/:teamUuid/overview
   * Quick stats: agent counts, task counts, workflow counts.
   */
  app.get(
    '/analytics/teams/:teamUuid/overview',
    {
      schema: teamParamSchema,
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const result = await getOverviewStats(app.db, teamUuid);
      return reply.send({ success: true, data: result });
    },
  );

  /**
   * GET /analytics/teams/:teamUuid/timeseries
   * Daily time-series data for tasks and workflows over the last N days.
   */
  app.get(
    '/analytics/teams/:teamUuid/timeseries',
    {
      schema: {
        ...teamParamSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 90, default: 30 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const { days } = request.query as { days?: number };
      const result = await getTimeSeries(app.db, teamUuid, days);
      return reply.send({ success: true, data: result });
    },
  );

  /**
   * GET /analytics/workflows
   * Global workflow success/failure metrics (admin or user-scoped).
   */
  app.get(
    '/analytics/workflows',
    {
      schema: dateRangeQuerySchema,
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { dateStart, dateEnd } = request.query as { dateStart?: string; dateEnd?: string };
      const userUuid = request.user.role === 'admin' ? undefined : request.user.sub;
      const result = await getWorkflowMetrics(app.db, userUuid, dateStart, dateEnd);
      return reply.send({ success: true, data: result });
    },
  );
}
