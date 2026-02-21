/**
 * Notification routes.
 * GET    /notifications         — list notifications (with optional unreadOnly filter)
 * GET    /notifications/unread  — get unread count
 * PATCH  /notifications/:uuid/read — mark single notification read
 * POST   /notifications/read-all   — mark all notifications read
 */
import type { FastifyInstance } from 'fastify';
import { listNotifications, getUnreadCount, markRead, markAllRead } from './service.js';

export async function notificationRoutes(app: FastifyInstance): Promise<void> {
  /** GET /notifications — list notifications */
  app.get(
    '/notifications',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = request.query as {
        unreadOnly?: string;
        page?: number;
        limit?: number;
      };
      const opts: { unreadOnly?: boolean; page?: number; limit?: number } = {};
      if (query.unreadOnly === 'true') opts.unreadOnly = true;
      if (query.page) opts.page = query.page;
      if (query.limit) opts.limit = query.limit;
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
    { preHandler: [app.authenticate] },
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
