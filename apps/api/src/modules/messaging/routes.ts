/**
 * Agent messaging routes — inter-agent communication.
 * All routes scoped to /teams/:teamUuid/messages — team isolation enforced.
 *
 * POST   /teams/:teamUuid/messages              — send a message
 * GET    /teams/:teamUuid/messages              — list team messages
 * GET    /teams/:teamUuid/messages/inbox/:agentUuid — agent inbox
 * PATCH  /teams/:teamUuid/messages/:messageUuid/read — mark as read
 */
import type { FastifyInstance } from 'fastify';
import {
  sendMessage,
  listMessages,
  listTeamMessages,
  markMessageRead,
} from './service.js';
import { assertTeamMember } from '../teams/service.js';

const teamUuidParam = {
  type: 'object',
  required: ['teamUuid'],
  properties: { teamUuid: { type: 'string', format: 'uuid' } },
} as const;

export async function messagingRoutes(app: FastifyInstance): Promise<void> {
  // POST /teams/:teamUuid/messages — send a message
  app.post(
    '/teams/:teamUuid/messages',
    {
      schema: {
        params: teamUuidParam,
        body: {
          type: 'object',
          required: ['fromAgentUuid', 'content'],
          additionalProperties: false,
          properties: {
            fromAgentUuid: { type: 'string', format: 'uuid' },
            toAgentUuid: { type: 'string', format: 'uuid' },
            messageType: { type: 'string', enum: ['direct', 'broadcast', 'system'], default: 'direct' },
            subject: { type: 'string', maxLength: 500 },
            content: { type: 'string', minLength: 1, maxLength: 50000 },
            metadata: { type: 'object' },
            workflowRunId: { type: 'string' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const body = request.body as {
        fromAgentUuid: string;
        toAgentUuid?: string;
        messageType?: string;
        subject?: string;
        content: string;
        metadata?: unknown;
        workflowRunId?: string;
      };

      const message = await sendMessage(app.db, { teamUuid, ...body });
      return reply.status(201).send({ success: true, data: message });
    },
  );

  // GET /teams/:teamUuid/messages — list all team messages
  app.get(
    '/teams/:teamUuid/messages',
    {
      schema: {
        params: teamUuidParam,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            workflowRunId: { type: 'string' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const query = request.query as {
        workflowRunId?: string;
        page?: number;
        limit?: number;
      };

      const result = await listTeamMessages(app.db, teamUuid, query);
      return reply.send({ success: true, data: result });
    },
  );

  // GET /teams/:teamUuid/messages/inbox/:agentUuid — agent inbox
  app.get(
    '/teams/:teamUuid/messages/inbox/:agentUuid',
    {
      schema: {
        params: {
          type: 'object',
          required: ['teamUuid', 'agentUuid'],
          properties: {
            teamUuid: { type: 'string', format: 'uuid' },
            agentUuid: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            messageType: { type: 'string', enum: ['direct', 'broadcast', 'system'] },
            unreadOnly: { type: 'boolean', default: false },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, agentUuid } = request.params as { teamUuid: string; agentUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const query = request.query as {
        messageType?: string;
        unreadOnly?: boolean;
        page?: number;
        limit?: number;
      };

      const result = await listMessages(app.db, teamUuid, agentUuid, query);
      return reply.send({ success: true, data: result });
    },
  );

  // PATCH /teams/:teamUuid/messages/:messageUuid/read — mark message as read
  app.patch(
    '/teams/:teamUuid/messages/:messageUuid/read',
    {
      schema: {
        params: {
          type: 'object',
          required: ['teamUuid', 'messageUuid'],
          properties: {
            teamUuid: { type: 'string', format: 'uuid' },
            messageUuid: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, messageUuid } = request.params as { teamUuid: string; messageUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const message = await markMessageRead(app.db, messageUuid, teamUuid);
      return reply.send({ success: true, data: message });
    },
  );
}
