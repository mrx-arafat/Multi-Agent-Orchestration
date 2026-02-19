/**
 * Kanban task board routes.
 * All routes are scoped to /teams/:teamUuid/kanban — team isolation enforced.
 *
 * POST   /teams/:teamUuid/kanban/tasks          — create a task
 * GET    /teams/:teamUuid/kanban/tasks          — list tasks (filterable)
 * POST   /teams/:teamUuid/kanban/tasks/:taskUuid/claim  — agent claims a task
 * PATCH  /teams/:teamUuid/kanban/tasks/:taskUuid/status — update task status
 * GET    /teams/:teamUuid/kanban/summary        — board summary (counts by status)
 */
import type { FastifyInstance } from 'fastify';
import {
  createTask,
  listTasks,
  claimTask,
  updateTaskStatus,
  getBoardSummary,
} from './service.js';
import { assertTeamMember } from '../teams/service.js';

const teamUuidParam = {
  type: 'object',
  required: ['teamUuid'],
  properties: { teamUuid: { type: 'string', format: 'uuid' } },
} as const;

const taskUuidParam = {
  type: 'object',
  required: ['teamUuid', 'taskUuid'],
  properties: {
    teamUuid: { type: 'string', format: 'uuid' },
    taskUuid: { type: 'string', format: 'uuid' },
  },
} as const;

export async function kanbanRoutes(app: FastifyInstance): Promise<void> {
  // POST /teams/:teamUuid/kanban/tasks
  app.post(
    '/teams/:teamUuid/kanban/tasks',
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
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
            tags: { type: 'array', items: { type: 'string', minLength: 1 }, default: [] },
            workflowRunId: { type: 'string' },
            assignedAgentUuid: { type: 'string', format: 'uuid' },
            parentTaskUuid: { type: 'string', format: 'uuid' },
            stageId: { type: 'string' },
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
        priority?: string;
        tags?: string[];
        workflowRunId?: string;
        assignedAgentUuid?: string;
        parentTaskUuid?: string;
        stageId?: string;
      };

      const task = await createTask(app.db, {
        teamUuid,
        ...body,
        createdByUserUuid: request.user.sub,
      });

      return reply.status(201).send({ success: true, data: task });
    },
  );

  // GET /teams/:teamUuid/kanban/tasks
  app.get(
    '/teams/:teamUuid/kanban/tasks',
    {
      schema: {
        params: teamUuidParam,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'] },
            tag: { type: 'string' },
            assignedAgentUuid: { type: 'string', format: 'uuid' },
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
        status?: string;
        tag?: string;
        assignedAgentUuid?: string;
        page?: number;
        limit?: number;
      };

      const result = await listTasks(app.db, teamUuid, query);
      return reply.send({ success: true, data: result });
    },
  );

  // POST /teams/:teamUuid/kanban/tasks/:taskUuid/claim
  app.post(
    '/teams/:teamUuid/kanban/tasks/:taskUuid/claim',
    {
      schema: {
        params: taskUuidParam,
        body: {
          type: 'object',
          required: ['agentUuid'],
          additionalProperties: false,
          properties: {
            agentUuid: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, taskUuid } = request.params as { teamUuid: string; taskUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { agentUuid } = request.body as { agentUuid: string };
      const task = await claimTask(app.db, taskUuid, agentUuid, teamUuid);
      return reply.send({ success: true, data: task });
    },
  );

  // PATCH /teams/:teamUuid/kanban/tasks/:taskUuid/status
  app.patch(
    '/teams/:teamUuid/kanban/tasks/:taskUuid/status',
    {
      schema: {
        params: taskUuidParam,
        body: {
          type: 'object',
          required: ['status'],
          additionalProperties: false,
          properties: {
            status: { type: 'string', enum: ['backlog', 'todo', 'in_progress', 'review', 'done'] },
            result: { type: 'string', maxLength: 10000 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, taskUuid } = request.params as { teamUuid: string; taskUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { status, result } = request.body as { status: string; result?: string };
      const task = await updateTaskStatus(app.db, taskUuid, teamUuid, status, result);
      return reply.send({ success: true, data: task });
    },
  );

  // GET /teams/:teamUuid/kanban/summary
  app.get(
    '/teams/:teamUuid/kanban/summary',
    {
      schema: { params: teamUuidParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid } = request.params as { teamUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const summary = await getBoardSummary(app.db, teamUuid);
      return reply.send({ success: true, data: summary });
    },
  );
}
