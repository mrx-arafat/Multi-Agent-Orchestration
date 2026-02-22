/**
 * Webhook routes — CRUD for webhook registrations + delivery history.
 *
 * POST   /teams/:teamUuid/webhooks              — register a webhook
 * GET    /teams/:teamUuid/webhooks              — list team webhooks
 * PATCH  /teams/:teamUuid/webhooks/:webhookUuid — update a webhook
 * DELETE /teams/:teamUuid/webhooks/:webhookUuid — delete a webhook
 * GET    /teams/:teamUuid/webhooks/:webhookUuid/deliveries — delivery history
 */
import type { FastifyInstance } from 'fastify';
import {
  createWebhook,
  listWebhooks,
  updateWebhook,
  deleteWebhook,
  listDeliveries,
} from './service.js';
import { assertTeamMember } from '../teams/service.js';

const teamUuidParam = {
  type: 'object',
  required: ['teamUuid'],
  properties: { teamUuid: { type: 'string', format: 'uuid' } },
} as const;

const webhookParam = {
  type: 'object',
  required: ['teamUuid', 'webhookUuid'],
  properties: {
    teamUuid: { type: 'string', format: 'uuid' },
    webhookUuid: { type: 'string', format: 'uuid' },
  },
} as const;

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // POST /teams/:teamUuid/webhooks
  app.post(
    '/teams/:teamUuid/webhooks',
    {
      schema: {
        params: teamUuidParam,
        body: {
          type: 'object',
          required: ['url', 'events'],
          additionalProperties: false,
          properties: {
            url: { type: 'string', format: 'uri', maxLength: 2048 },
            events: {
              type: 'array',
              items: { type: 'string', minLength: 1 },
              minItems: 1,
            },
            description: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { url, events, description } = request.body as {
        url: string; events: string[]; description?: string;
      };

      const params: { teamUuid: string; url: string; events: string[]; createdByUserUuid: string; description?: string } = {
        teamUuid,
        url,
        events,
        createdByUserUuid: request.user.sub,
      };
      if (description !== undefined) params.description = description;

      const webhook = await createWebhook(app.db, params);

      return reply.status(201).send({ success: true, data: webhook });
    },
  );

  // GET /teams/:teamUuid/webhooks
  app.get(
    '/teams/:teamUuid/webhooks',
    {
      schema: { params: teamUuidParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const list = await listWebhooks(app.db, teamUuid);
      return reply.send({ success: true, data: list });
    },
  );

  // PATCH /teams/:teamUuid/webhooks/:webhookUuid
  app.patch(
    '/teams/:teamUuid/webhooks/:webhookUuid',
    {
      schema: {
        params: webhookParam,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', format: 'uri', maxLength: 2048 },
            events: { type: 'array', items: { type: 'string', minLength: 1 } },
            active: { type: 'boolean' },
            description: { type: 'string', maxLength: 500 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, webhookUuid } = request.params as { teamUuid: string; webhookUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const body = request.body as {
        url?: string; events?: string[]; active?: boolean; description?: string;
      };

      const webhook = await updateWebhook(app.db, webhookUuid, teamUuid, body);
      return reply.send({ success: true, data: webhook });
    },
  );

  // DELETE /teams/:teamUuid/webhooks/:webhookUuid
  app.delete(
    '/teams/:teamUuid/webhooks/:webhookUuid',
    {
      schema: { params: webhookParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, webhookUuid } = request.params as { teamUuid: string; webhookUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      await deleteWebhook(app.db, webhookUuid, teamUuid);
      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  // GET /teams/:teamUuid/webhooks/:webhookUuid/deliveries
  app.get(
    '/teams/:teamUuid/webhooks/:webhookUuid/deliveries',
    {
      schema: {
        params: webhookParam,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, webhookUuid } = request.params as { teamUuid: string; webhookUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { limit } = request.query as { limit?: number };
      const deliveries = await listDeliveries(app.db, webhookUuid, limit);
      return reply.send({ success: true, data: deliveries });
    },
  );
}
