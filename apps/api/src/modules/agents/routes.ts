/**
 * Agent routes module.
 * POST   /agents/register        — register new agent
 * GET    /agents                 — list agents (filterable, paginated)
 * GET    /agents/:agentUuid      — get agent details
 * DELETE /agents/:agentUuid      — soft-delete (owner only)
 *
 * All routes require JWT authentication via app.authenticate.
 */
import type { FastifyInstance } from 'fastify';
import {
  registerAgent,
  listAgents,
  getAgentByUuid,
  deleteAgent,
} from './service.js';
import {
  registerAgentSchema,
  listAgentsSchema,
  agentUuidParamSchema,
} from './schemas.js';
import { checkAgentHealth } from './health-checker.js';

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /agents/register
   * Body: { agentId, name, description?, endpoint, authToken, capabilities?, maxConcurrentTasks? }
   * Returns 201 + agent object (no authToken/authTokenHash)
   */
  app.post(
    '/agents/register',
    { schema: registerAgentSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = request.body as {
        agentId: string;
        name: string;
        description?: string;
        endpoint: string;
        authToken: string;
        capabilities?: string[];
        maxConcurrentTasks?: number;
      };

      const agent = await registerAgent(app.db, {
        ...body,
        registeredByUserUuid: request.user.sub,
      });

      return reply.status(201).send({ success: true, data: agent });
    },
  );

  /**
   * GET /agents
   * Query: ?capability=x&status=online&page=1&limit=20
   */
  app.get(
    '/agents',
    { schema: listAgentsSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = request.query as {
        capability?: string;
        status?: string;
        page?: number;
        limit?: number;
      };

      const result = await listAgents(app.db, query);

      return reply.send({ success: true, data: result });
    },
  );

  /**
   * GET /agents/:agentUuid
   */
  app.get(
    '/agents/:agentUuid',
    { schema: agentUuidParamSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const agent = await getAgentByUuid(app.db, agentUuid);
      return reply.send({ success: true, data: agent });
    },
  );

  /**
   * DELETE /agents/:agentUuid
   * Only the registering user can delete their agent.
   */
  app.delete(
    '/agents/:agentUuid',
    { schema: agentUuidParamSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      await deleteAgent(app.db, agentUuid, request.user.sub);
      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  /**
   * POST /agents/:agentUuid/health-check
   * Triggers a manual health check for a specific agent.
   * Returns the health check result with status transition.
   */
  app.post(
    '/agents/:agentUuid/health-check',
    { schema: agentUuidParamSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const result = await checkAgentHealth(app.db, agentUuid);
      return reply.send({ success: true, data: result });
    },
  );
}
