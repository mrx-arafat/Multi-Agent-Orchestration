/** Notification tools. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MaofClient } from '../api-client.js';
import { ok, err, buildQs } from '../helpers.js';

export function registerNotificationsTools(server: McpServer, client: MaofClient) {
  server.tool(
    'notifications_list',
    'List notifications for the current user',
    {
      unreadOnly: z.boolean().optional().describe('Only return unread notifications'),
    },
    async ({ unreadOnly }) => {
      try {
        const qs = buildQs({ unreadOnly });
        return ok(await client.get(`/notifications${qs}`));
      } catch (e) {
        return err(`notifications_list failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'notifications_mark_all_read',
    'Mark all notifications as read',
    {},
    async () => {
      try {
        return ok(await client.post('/notifications/read-all'));
      } catch (e) {
        return err(`notifications_mark_all_read failed: ${(e as Error).message}`);
      }
    },
  );
}
