/**
 * Notification routes.
 * GET    /notifications         — list notifications (with optional unreadOnly filter)
 * GET    /notifications/unread  — get unread count
 * PATCH  /notifications/:uuid/read — mark single notification read
 * POST   /notifications/read-all   — mark all notifications read
 */
import type { FastifyInstance } from 'fastify';
import { listNotifications, getUnreadCount, markRead, markAllRead } from './service.js';
import { uuidParam } from '../../lib/schema-utils.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  /** GET /notifications — list notifications */
  app.get(
    '/notifications',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            unreadOnly: { type: 'boolean', default: false },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { unreadOnly, page, limit } = request.query as {
        unreadOnly?: boolean;
        page?: number;
        limit?: number;
      };
      const opts: { unreadOnly?: boolean; page?: number; limit?: number } = {};
      if (unreadOnly) opts.unreadOnly = true;
      if (page) opts.page = page;
      if (limit) opts.limit = limit;
      const result = await listNotifications(app.db, request.user.sub, opts);
      return reply.send({ success: true, data: result });
    },
  );

  /** GET /notifications/unread — get unread count */
  app.get(
    '/notifications/unread',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const count = await getUnreadCount(app.db, request.user.sub);
      return reply.send({ success: true, data: { count } });
    },
  );

  /** PATCH /notifications/:uuid/read — mark notification as read */
  app.patch(
    '/notifications/:uuid/read',
    {
      schema: { params: uuidParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid } = request.params as { uuid: string };
      const notification = await markRead(app.db, uuid, request.user.sub);
      return reply.send({ success: true, data: notification });
    },
  );

  /** POST /notifications/read-all — mark all as read */
  app.post(
    '/notifications/read-all',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const count = await markAllRead(app.db, request.user.sub);
      return reply.send({ success: true, data: { markedRead: count } });
    },
  );
}
