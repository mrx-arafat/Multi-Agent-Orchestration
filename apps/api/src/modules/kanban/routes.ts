/**
 * Kanban task board routes.
 * All routes are scoped to /teams/:teamUuid/kanban — team isolation enforced.
 *
 * POST   /teams/:teamUuid/kanban/tasks                  — create a task
 * GET    /teams/:teamUuid/kanban/tasks                  — list tasks (filterable)
 * GET    /teams/:teamUuid/kanban/tasks/:taskUuid        — get single task
 * PATCH  /teams/:teamUuid/kanban/tasks/:taskUuid        — edit task fields
 * DELETE /teams/:teamUuid/kanban/tasks/:taskUuid        — delete a task
 * POST   /teams/:teamUuid/kanban/tasks/:taskUuid/claim  — agent claims a task
 * PATCH  /teams/:teamUuid/kanban/tasks/:taskUuid/status — update task status
 * GET    /teams/:teamUuid/kanban/summary                — board summary (counts by status)
 */
import type { FastifyInstance } from 'fastify';
import {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  claimTask,
  updateTaskStatus,
  getBoardSummary,
} from './service.js';
import { getTaskDependencyContext } from './context-resolver.js';
import { assertTeamMember } from '../teams/service.js';
import { teamUuidParam, teamResourceParam } from '../../lib/schema-utils.js';

const taskUuidParam = teamResourceParam('taskUuid');

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
            // Phase 9: Context Store & Dependencies
            dependsOn: { type: 'array', items: { type: 'string', format: 'uuid' }, default: [] },
            inputMapping: { type: 'object' },
            outputSchema: { type: 'object' },
            maxRetries: { type: 'integer', minimum: 0, maximum: 10, default: 0 },
            timeoutMs: { type: 'integer', minimum: 1000 },
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
        dependsOn?: string[];
        inputMapping?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
        maxRetries?: number;
        timeoutMs?: number;
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
            output: { type: 'object' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, taskUuid } = request.params as { teamUuid: string; taskUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const { status, result, output } = request.body as { status: string; result?: string; output?: Record<string, unknown> };
      const task = await updateTaskStatus(app.db, taskUuid, teamUuid, status, result, output);
      return reply.send({ success: true, data: task });
    },
  );

  // GET /teams/:teamUuid/kanban/tasks/:taskUuid
  app.get(
    '/teams/:teamUuid/kanban/tasks/:taskUuid',
    {
      schema: { params: taskUuidParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, taskUuid } = request.params as { teamUuid: string; taskUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const task = await getTask(app.db, taskUuid, teamUuid);
      return reply.send({ success: true, data: task });
    },
  );

  // PATCH /teams/:teamUuid/kanban/tasks/:taskUuid — edit task fields
  app.patch(
    '/teams/:teamUuid/kanban/tasks/:taskUuid',
    {
      schema: {
        params: taskUuidParam,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 500 },
            description: { type: ['string', 'null'], maxLength: 4096 },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
            tags: { type: 'array', items: { type: 'string', minLength: 1 } },
            assignedAgentUuid: { type: ['string', 'null'], format: 'uuid' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, taskUuid } = request.params as { teamUuid: string; taskUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const body = request.body as {
        title?: string;
        description?: string | null;
        priority?: string;
        tags?: string[];
        assignedAgentUuid?: string | null;
      };

      const task = await updateTask(app.db, taskUuid, teamUuid, body);
      return reply.send({ success: true, data: task });
    },
  );

  // DELETE /teams/:teamUuid/kanban/tasks/:taskUuid
  app.delete(
    '/teams/:teamUuid/kanban/tasks/:taskUuid',
    {
      schema: { params: taskUuidParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, taskUuid } = request.params as { teamUuid: string; taskUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      await deleteTask(app.db, taskUuid, teamUuid);
      return reply.send({ success: true, data: { deleted: true } });
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

  // GET /teams/:teamUuid/kanban/tasks/:taskUuid/context — Phase 9: dependency context
  app.get(
    '/teams/:teamUuid/kanban/tasks/:taskUuid/context',
    {
      schema: { params: taskUuidParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { teamUuid, taskUuid } = request.params as { teamUuid: string; taskUuid: string };
      await assertTeamMember(app.db, teamUuid, request.user.sub);

      const context = await getTaskDependencyContext(app.db, taskUuid);
      return reply.send({ success: true, data: context });
    },
  );
}
