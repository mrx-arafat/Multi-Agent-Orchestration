/**
 * Metrics routes — cost tracking and observability.
 *
 * GET /teams/:teamUuid/metrics/cost           — team cost summary
 * GET /teams/:teamUuid/metrics/agents         — per-agent cost breakdown
 * GET /teams/:teamUuid/metrics/daily          — daily cost time-series
 * GET /workflows/:runId/metrics               — per-workflow cost breakdown
 * POST /metrics                               — record a metric (internal/agent use)
 */
import type { FastifyInstance } from 'fastify';
import {
  recordMetric,
  getTeamCostSummary,
  getAgentCostBreakdown,
  getWorkflowCostBreakdown,
  getDailyCostTimeSeries,
} from './service.js';
import { assertTeamMember } from '../teams/service.js';

const teamUuidParam = {
  type: 'object',
  required: ['teamUuid'],
  properties: { teamUuid: { type: 'string', format: 'uuid' } },
} as const;

export async function metricsRoutes(app: FastifyInstance): Promise<void> {
  // POST /metrics — record a metric (for agents/internal)
  app.post(
    '/metrics',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            taskUuid: { type: 'string', format: 'uuid' },
            workflowRunId: { type: 'string' },
            stageId: { type: 'string' },
            agentUuid: { type: 'string', format: 'uuid' },
            agentId: { type: 'string' },
            teamUuid: { type: 'string', format: 'uuid' },
            tokensUsed: { type: 'integer', minimum: 0 },
            promptTokens: { type: 'integer', minimum: 0 },
            completionTokens: { type: 'integer', minimum: 0 },
            costCents: { type: 'integer', minimum: 0 },
            latencyMs: { type: 'integer', minimum: 0 },
            queueWaitMs: { type: 'integer', minimum: 0 },
            provider: { type: 'string' },
            model: { type: 'string' },
            capability: { type: 'string' },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const body = request.body as Record<string, unknown>;
      const result = await recordMetric(app.db, body);
      return reply.status(201).send({ success: true, data: result });
    },
  );

  // GET /teams/:teamUuid/metrics/cost
  app.get(
    '/teams/:teamUuid/metrics/cost',
    {
      schema: {
        params: teamUuidParam,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { days } = request.query as { days?: number };
      const summary = await getTeamCostSummary(app.db, teamUuid, days);
      return reply.send({ success: true, data: summary });
    },
  );

  // GET /teams/:teamUuid/metrics/agents
  app.get(
    '/teams/:teamUuid/metrics/agents',
    {
      schema: {
        params: teamUuidParam,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { days } = request.query as { days?: number };
      const breakdown = await getAgentCostBreakdown(app.db, teamUuid, days);
      return reply.send({ success: true, data: breakdown });
    },
  );

  // GET /teams/:teamUuid/metrics/daily
  app.get(
    '/teams/:teamUuid/metrics/daily',
    {
      schema: {
        params: teamUuidParam,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { days } = request.query as { days?: number };
      const timeSeries = await getDailyCostTimeSeries(app.db, teamUuid, days);
      return reply.send({ success: true, data: timeSeries });
    },
  );

  // GET /workflows/:runId/metrics
  app.get(
    '/workflows/:runId/metrics',
    {
      schema: {
        params: {
          type: 'object',
          required: ['runId'],
          properties: { runId: { type: 'string' } },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const breakdown = await getWorkflowCostBreakdown(app.db, runId);
      return reply.send({ success: true, data: breakdown });
    },
  );
}
