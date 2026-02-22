import type { FastifyInstance } from 'fastify';
import {
  grantPermissionSchema,
  checkPermissionSchema,
  revokePermissionSchema,
  permissionLogsSchema,
} from './schemas.js';
import {
  grantPermission,
  checkPermission,
  getAgentPermission,
  revokePermission,
  getPermissionLogs,
} from './service.js';

export async function agentPermissionRoutes(app: FastifyInstance): Promise<void> {
  // Grant/update permissions for an agent
  app.put(
    '/agents/:agentUuid/permissions',
    { schema: grantPermissionSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const body = request.body as {
        role: 'researcher' | 'executor' | 'deployer' | 'auditor' | 'admin';
        allowedCapabilities?: string[];
        deniedCapabilities?: string[];
        allowedResources?: Record<string, unknown>;
        deniedResources?: Record<string, unknown>;
        canCallExternalApis?: boolean;
        canAccessProduction?: boolean;
        canModifyData?: boolean;
        canDelegateToAgents?: boolean;
        description?: string;
      };

      const permission = await grantPermission(app.db, {
        agentUuid,
        ...body,
        grantedByUserUuid: request.user.sub,
      });

      return reply.send({ success: true, data: permission });
    },
  );

  // Check if an agent has permission for a capability
  app.get(
    '/agents/:agentUuid/permissions/check',
    { schema: checkPermissionSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const { capability, resource } = request.query as {
        capability: string;
        resource?: string;
      };

      const result = await checkPermission(app.db, agentUuid, capability, resource);
      return reply.send({ success: true, data: result });
    },
  );

  // Get permissions for an agent
  app.get(
    '/agents/:agentUuid/permissions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const permission = await getAgentPermission(app.db, agentUuid);
      return reply.send({ success: true, data: permission });
    },
  );

  // Revoke permissions
  app.delete(
    '/agents/:agentUuid/permissions',
    { schema: revokePermissionSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      await revokePermission(app.db, agentUuid, request.user.sub);
      return reply.send({ success: true, data: { revoked: true } });
    },
  );

  // Get permission audit logs
  app.get(
    '/agents/:agentUuid/permissions/logs',
    { schema: permissionLogsSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const { limit } = request.query as { limit?: number };
      const logs = await getPermissionLogs(app.db, agentUuid, limit);
      return reply.send({ success: true, data: { logs, count: logs.length } });
    },
  );
}
