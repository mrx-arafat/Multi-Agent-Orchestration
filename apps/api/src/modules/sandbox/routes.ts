import type { FastifyInstance } from 'fastify';
import {
  dryRunSchema,
  shadowRunSchema,
  getSandboxRunSchema,
  listSandboxRunsSchema,
} from './schemas.js';
import {
  executeDryRun,
  executeShadowRun,
  getSandboxRun,
  listSandboxRuns,
} from './service.js';
import type { WorkflowDefinition } from '../workflows/validator.js';

export async function sandboxRoutes(app: FastifyInstance): Promise<void> {
  // Execute dry-run
  app.post(
    '/sandbox/dry-run',
    { schema: dryRunSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { workflow, input } = request.body as {
        workflow: WorkflowDefinition;
        input?: Record<string, unknown>;
      };

      const result = await executeDryRun(app.db, {
        workflowDefinition: workflow,
        input,
        createdByUserUuid: request.user.sub,
      });

      return reply.status(201).send({ success: true, data: result });
    },
  );

  // Execute shadow run
  app.post(
    '/sandbox/shadow',
    { schema: shadowRunSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { workflowRunId, workflow, input } = request.body as {
        workflowRunId: string;
        workflow: WorkflowDefinition;
        input?: Record<string, unknown>;
      };

      const result = await executeShadowRun(app.db, {
        workflowRunId,
        workflowDefinition: workflow,
        input,
        createdByUserUuid: request.user.sub,
      });

      return reply.status(201).send({ success: true, data: result });
    },
  );

  // Get sandbox run by UUID
  app.get(
    '/sandbox/:sandboxUuid',
    { schema: getSandboxRunSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { sandboxUuid } = request.params as { sandboxUuid: string };
      const run = await getSandboxRun(app.db, sandboxUuid);
      return reply.send({ success: true, data: run });
    },
  );

  // List sandbox runs
  app.get(
    '/sandbox',
    { schema: listSandboxRunsSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { mode } = request.query as { mode?: 'dry_run' | 'shadow' | 'isolated' };
      const runs = await listSandboxRuns(app.db, request.user.sub, mode);
      return reply.send({ success: true, data: { runs, count: runs.length } });
    },
  );
}
