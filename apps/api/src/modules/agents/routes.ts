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
import { getAgentActivity } from './activity-service.js';
import { matchAgentsForCapability } from './router.js';

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
        agentType?: string;
        teamUuid?: string;
        createTeam?: boolean;
        teamName?: string;
      };

      const result = await registerAgent(app.db, {
        ...body,
        registeredByUserUuid: request.user.sub,
      });

      return reply.status(201).send({ success: true, data: result.agent, team: result.team });
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

  /**
   * GET /agents/match/:capability
   * Returns scored agents matching a capability, with the recommended best agent.
   * Used for smart routing decisions and capability inspection.
   */
  app.get(
    '/agents/match/:capability',
    {
      schema: {
        params: {
          type: 'object',
          required: ['capability'],
          properties: {
            capability: { type: 'string', minLength: 1 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { capability } = request.params as { capability: string };
      const result = await matchAgentsForCapability(app.db, capability, app.redis);
      return reply.send({ success: true, data: result });
    },
  );

  /**
   * GET /agents/:agentUuid/activity
   * Returns the agent's execution history (SRS FR-5.3).
   * Query: ?status=completed&dateStart=2026-01-01&dateEnd=2026-12-31&page=1&limit=20
   */
  app.get(
    '/agents/:agentUuid/activity',
    {
      schema: {
        params: {
          type: 'object',
          required: ['agentUuid'],
          properties: {
            agentUuid: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['queued', 'in_progress', 'completed', 'failed'] },
            dateStart: { type: 'string', format: 'date' },
            dateEnd: { type: 'string', format: 'date' },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const query = request.query as {
        status?: string;
        dateStart?: string;
        dateEnd?: string;
        page?: number;
        limit?: number;
      };

      const result = await getAgentActivity(app.db, agentUuid, query);
      return reply.send({ success: true, data: result });
    },
  );
}
