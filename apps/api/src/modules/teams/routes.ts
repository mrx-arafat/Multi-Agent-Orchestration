/**
 * Team routes module.
 * POST   /teams                                          — create a team
 * GET    /teams                                          — list user's teams
 * GET    /teams/:teamUuid                                — get team details
 * POST   /teams/:teamUuid/agents                        — add agent to team
 * DELETE /teams/:teamUuid/agents/:agentUuid              — remove agent from team
 * GET    /teams/:teamUuid/agents                        — list team agents
 * POST   /teams/:teamUuid/members                       — add team member
 * POST   /teams/:teamUuid/invitations                   — create invitation (owner/admin)
 * GET    /teams/:teamUuid/invitations                   — list invitations (owner/admin)
 * DELETE /teams/:teamUuid/invitations/:invitationUuid   — revoke invitation
 * POST   /teams/join                                    — accept invitation
 */
import type { FastifyInstance } from 'fastify';
import {
  createTeam,
  getTeam,
  listUserTeams,
  addAgentToTeam,
  removeAgentFromTeam,
  listTeamAgents,
  addTeamMember,
} from './service.js';
import {
  createInvitation,
  acceptInvitation,
  listInvitations,
  revokeInvitation,
} from './invitation-service.js';
import { teamUuidParam as teamUuidParamObj } from '../../lib/schema-utils.js';

const teamUuidParam = { params: teamUuidParamObj } as const;

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  // POST /teams
  app.post(
    '/teams',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string', maxLength: 2048 },
            maxAgents: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const body = request.body as { name: string; description?: string; maxAgents?: number };
      const team = await createTeam(app.db, { ...body, ownerUserUuid: request.user.sub });
      return reply.status(201).send({ success: true, data: team });
    },
  );

  // GET /teams
  app.get('/teams', { preHandler: [app.authenticate] }, async (request, reply) => {
    const teams = await listUserTeams(app.db, request.user.sub);
    return reply.send({ success: true, data: teams });
  });

  // GET /teams/:teamUuid
  app.get(
    '/teams/:teamUuid',
    { schema: teamUuidParam, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const team = await getTeam(app.db, teamUuid, request.user.sub);
      return reply.send({ success: true, data: team });
    },
  );

  // POST /teams/:teamUuid/agents — add agent to team
  app.post(
    '/teams/:teamUuid/agents',
    {
      schema: {
        params: teamUuidParam.params,
        body: {
          type: 'object',
          required: ['agentUuid'],
          additionalProperties: false,
          properties: { agentUuid: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const { agentUuid } = request.body as { agentUuid: string };
      await addAgentToTeam(app.db, teamUuid, agentUuid, request.user.sub);
      return reply.send({ success: true, data: { added: true } });
    },
  );

  // DELETE /teams/:teamUuid/agents/:agentUuid — remove agent from team
  app.delete(
    '/teams/:teamUuid/agents/:agentUuid',
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
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, agentUuid } = request.params as { teamUuid: string; agentUuid: string };
      await removeAgentFromTeam(app.db, teamUuid, agentUuid, request.user.sub);
      return reply.send({ success: true, data: { removed: true } });
    },
  );

  // GET /teams/:teamUuid/agents — list team agents
  app.get(
    '/teams/:teamUuid/agents',
    { schema: teamUuidParam, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const agentList = await listTeamAgents(app.db, teamUuid, request.user.sub);
      return reply.send({ success: true, data: agentList });
    },
  );

  // POST /teams/:teamUuid/members — add user to team
  app.post(
    '/teams/:teamUuid/members',
    {
      schema: {
        params: teamUuidParam.params,
        body: {
          type: 'object',
          required: ['userUuid'],
          additionalProperties: false,
          properties: {
            userUuid: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['admin', 'member'], default: 'member' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const { userUuid, role } = request.body as { userUuid: string; role?: string };
      await addTeamMember(app.db, teamUuid, userUuid, role ?? 'member', request.user.sub);
      return reply.send({ success: true, data: { added: true } });
    },
  );

  // -------------------------------------------------------------------------
  // Invitation routes
  // -------------------------------------------------------------------------

  // POST /teams/join — accept an invitation (must be registered BEFORE :teamUuid catch-all)
  app.post(
    '/teams/join',
    {
      schema: {
        body: {
          type: 'object',
          required: ['inviteCode'],
          additionalProperties: false,
          properties: {
            inviteCode: { type: 'string', minLength: 1, maxLength: 32 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { inviteCode } = request.body as { inviteCode: string };
      const result = await acceptInvitation(app.db, inviteCode, request.user.sub);
      return reply.send({ success: true, data: result });
    },
  );

  // POST /teams/:teamUuid/invitations — create invitation (owner/admin)
  app.post(
    '/teams/:teamUuid/invitations',
    {
      schema: {
        params: teamUuidParam.params,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            role: { type: 'string', enum: ['admin', 'member'], default: 'member' },
            maxUses: { type: 'integer', minimum: 1, maximum: 1000, default: 1 },
            expiresInHours: { type: 'number', minimum: 1, maximum: 8760 }, // max 1 year
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const body = request.body as { role?: string; maxUses?: number; expiresInHours?: number } | undefined;
      const invitation = await createInvitation(app.db, teamUuid, request.user.sub, body);
      return reply.status(201).send({ success: true, data: invitation });
    },
  );

  // GET /teams/:teamUuid/invitations — list active invitations (owner/admin)
  app.get(
    '/teams/:teamUuid/invitations',
    { schema: teamUuidParam, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      const invitations = await listInvitations(app.db, teamUuid, request.user.sub);
      return reply.send({ success: true, data: invitations });
    },
  );

  // DELETE /teams/:teamUuid/invitations/:invitationUuid — revoke invitation
  app.delete(
    '/teams/:teamUuid/invitations/:invitationUuid',
    {
      schema: {
        params: {
          type: 'object',
          required: ['teamUuid', 'invitationUuid'],
          properties: {
            teamUuid: { type: 'string', format: 'uuid' },
            invitationUuid: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { invitationUuid } = request.params as { teamUuid: string; invitationUuid: string };
      await revokeInvitation(app.db, invitationUuid, request.user.sub);
      return reply.send({ success: true, data: { revoked: true } });
    },
  );
}
