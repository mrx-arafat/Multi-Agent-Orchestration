/**
 * Workflow template routes.
 * GET    /templates              — list templates (public + user's private)
 * GET    /templates/:templateUuid — get template details
 * POST   /templates              — create a template
 * PUT    /templates/:templateUuid — update a template (owner only)
 * DELETE /templates/:templateUuid — delete a template (owner/admin)
 * POST   /templates/:templateUuid/use — instantiate template as a workflow run
 */
import type { FastifyInstance } from 'fastify';
import {
  listTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  incrementUsageCount,
} from './service.js';
import { createWorkflowRun } from '../workflows/service.js';
import { validateWorkflowDefinition, type WorkflowDefinition } from '../workflows/validator.js';
import { uuidParam } from '../../lib/schema-utils.js';

const templateUuidParam = {
  type: 'object',
  required: ['templateUuid'],
  properties: { templateUuid: { type: 'string', format: 'uuid' } },
} as const;

export async function templateRoutes(app: FastifyInstance): Promise<void> {
  /** GET /templates — list templates */
  app.get(
    '/templates',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            category: { type: 'string', maxLength: 100 },
            search: { type: 'string', maxLength: 200 },
            page: { type: 'integer', minimum: 1, default: 1 },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const query = request.query as {
        category?: string;
        search?: string;
        page?: number;
        limit?: number;
      };
      const result = await listTemplates(app.db, {
        ...query,
        userUuid: request.user.sub,
      });
      return reply.send({ success: true, data: result });
    },
  );

  /** GET /templates/:templateUuid — get template */
  app.get(
    '/templates/:templateUuid',
    {
      schema: { params: templateUuidParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { templateUuid } = request.params as { templateUuid: string };
      const template = await getTemplate(app.db, templateUuid);
      return reply.send({ success: true, data: template });
    },
  );

  /** POST /templates — create template */
  app.post(
    '/templates',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name', 'definition'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            category: { type: 'string', maxLength: 100 },
            definition: { type: 'object' },
            isPublic: { type: 'boolean', default: true },
            tags: { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 20 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const body = request.body as {
        name: string;
        description?: string;
        category?: string;
        definition: unknown;
        isPublic?: boolean;
        tags?: string[];
      };

      const template = await createTemplate(app.db, {
        ...body,
        createdByUserUuid: request.user.sub,
      });
      return reply.status(201).send({ success: true, data: template });
    },
  );

  /** PUT /templates/:templateUuid — update template */
  app.put(
    '/templates/:templateUuid',
    {
      schema: {
        params: templateUuidParam,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            description: { type: 'string', maxLength: 2000 },
            category: { type: 'string', maxLength: 100 },
            definition: { type: 'object' },
            isPublic: { type: 'boolean' },
            tags: { type: 'array', items: { type: 'string', maxLength: 50 }, maxItems: 20 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { templateUuid } = request.params as { templateUuid: string };
      const body = request.body as {
        name?: string;
        description?: string;
        category?: string;
        definition?: unknown;
        isPublic?: boolean;
        tags?: string[];
      };

      const template = await updateTemplate(app.db, templateUuid, request.user.sub, body);
      return reply.send({ success: true, data: template });
    },
  );

  /** DELETE /templates/:templateUuid — delete template */
  app.delete(
    '/templates/:templateUuid',
    {
      schema: { params: templateUuidParam },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { templateUuid } = request.params as { templateUuid: string };
      await deleteTemplate(app.db, templateUuid, request.user.sub, request.user.role);
      return reply.send({ success: true, data: { deleted: true } });
    },
  );

  /** POST /templates/:templateUuid/use — instantiate and execute a workflow from template */
  app.post(
    '/templates/:templateUuid/use',
    {
      schema: {
        params: templateUuidParam,
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            input: { type: 'object' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { templateUuid } = request.params as { templateUuid: string };
      const { input } = (request.body ?? {}) as { input?: Record<string, unknown> };

      const template = await getTemplate(app.db, templateUuid);
      const definition = template.definition as WorkflowDefinition;

      // Validate the workflow definition
      validateWorkflowDefinition(definition);

      // Create the workflow run
      const result = await createWorkflowRun(app.db, {
        definition,
        input: input ?? {},
        userUuid: request.user.sub,
      });

      // Enqueue for execution
      await app.workflowQueue.add(
        'execute-workflow',
        { workflowRunId: result.workflowRunId, userUuid: request.user.sub },
        { jobId: result.workflowRunId },
      );

      // Increment usage count (best-effort, log on failure)
      await incrementUsageCount(app.db, templateUuid).catch((err) => {
        app.log.warn({ err, templateUuid }, 'Failed to increment template usage count');
      });

      return reply.status(202).send({ success: true, data: result });
    },
  );
}
