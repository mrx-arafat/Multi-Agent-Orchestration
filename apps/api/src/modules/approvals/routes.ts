/**
 * Approval Gate routes — human-in-the-loop approval endpoints.
 *
 * POST   /teams/:teamUuid/approvals                    — request approval
 * GET    /teams/:teamUuid/approvals                    — list approval gates
 * GET    /teams/:teamUuid/approvals/:gateUuid          — get single gate
 * POST   /teams/:teamUuid/approvals/:gateUuid/respond  — approve or reject
 */
import type { FastifyInstance } from 'fastify';
import {
  createApprovalGate,
  listApprovalGates,
  getApprovalGate,
  respondToApproval,
} from './service.js';
import { assertTeamMember } from '../teams/service.js';

const teamUuidParam = {
  type: 'object',
  required: ['teamUuid'],
  properties: { teamUuid: { type: 'string', format: 'uuid' } },
} as const;

const gateParam = {
  type: 'object',
  required: ['teamUuid', 'gateUuid'],
  properties: {
    teamUuid: { type: 'string', format: 'uuid' },
    gateUuid: { type: 'string', format: 'uuid' },
  },
} as const;

export async function approvalRoutes(app: FastifyInstance): Promise<void> {
  // POST /teams/:teamUuid/approvals — request approval
  app.post(
    '/teams/:teamUuid/approvals',
    {
      schema: {
        params: teamUuidParam,
        body: {
          type: 'object',
          required: ['title'],
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 500 },
            description: { type: 'string', maxLength: 4096 },
            taskUuid: { type: 'string', format: 'uuid' },
            workflowRunId: { type: 'string' },
            stageId: { type: 'string' },
            requestedByAgentUuid: { type: 'string', format: 'uuid' },
            approvers: { type: 'array', items: { type: 'string', format: 'uuid' } },
            expiresInMs: { type: 'integer', minimum: 60000 }, // Min 1 minute
            context: { type: 'object' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const body = request.body as {
        title: string;
        description?: string;
        taskUuid?: string;
        workflowRunId?: string;
        stageId?: string;
        requestedByAgentUuid?: string;
        approvers?: string[];
        expiresInMs?: number;
        context?: Record<string, unknown>;
      };

      const gate = await createApprovalGate(app.db, {
        teamUuid,
        ...body,
        requestedByUserUuid: request.user.sub,
      });

      return reply.status(201).send({ success: true, data: gate });
    },
  );

  // GET /teams/:teamUuid/approvals — list gates
  app.get(
    '/teams/:teamUuid/approvals',
    {
      schema: {
        params: teamUuidParam,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['pending', 'approved', 'rejected', 'expired'] },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { status } = request.query as { status?: string };
      const gates = await listApprovalGates(app.db, teamUuid, status);
      return reply.send({ success: true, data: gates });
    },
  );

  // GET /teams/:teamUuid/approvals/:gateUuid — single gate
  app.get(
    '/teams/:teamUuid/approvals/:gateUuid',
    {
      schema: { params: gateParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, gateUuid } = request.params as { teamUuid: string; gateUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const gate = await getApprovalGate(app.db, gateUuid);
      return reply.send({ success: true, data: gate });
    },
  );

  // POST /teams/:teamUuid/approvals/:gateUuid/respond — approve or reject
  app.post(
    '/teams/:teamUuid/approvals/:gateUuid/respond',
    {
      schema: {
        params: gateParam,
        body: {
          type: 'object',
          required: ['decision'],
          additionalProperties: false,
          properties: {
            decision: { type: 'string', enum: ['approved', 'rejected'] },
            note: { type: 'string', maxLength: 2000 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, gateUuid } = request.params as { teamUuid: string; gateUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { decision, note } = request.body as { decision: 'approved' | 'rejected'; note?: string };
      const gate = await respondToApproval(app.db, gateUuid, request.user.sub, decision, note);
      return reply.send({ success: true, data: gate });
    },
  );
}
