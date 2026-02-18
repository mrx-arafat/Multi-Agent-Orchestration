/**
 * Workflow routes module.
 * POST /workflows/execute        — submit a workflow for execution
 * GET  /workflows/:runId         — get current execution status & progress
 * GET  /workflows/:runId/result  — get final output (404 if not complete)
 *
 * All routes require JWT authentication.
 */
import type { FastifyInstance } from 'fastify';
import { validateWorkflowDefinition } from './validator.js';
import { createWorkflowRun, listWorkflowRuns, getWorkflowStatus, getWorkflowResult } from './service.js';
import { executeWorkflowSchema, workflowRunIdParamSchema } from './schemas.js';
import type { WorkflowDefinition } from './validator.js';

export async function workflowRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /workflows/execute
   * Body: { workflow: WorkflowDefinition, input?: object }
   * Returns 202 + { workflowRunId, status: "queued" }
   */
  app.post(
    '/workflows/execute',
    { schema: executeWorkflowSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { workflow, input } = request.body as {
        workflow: WorkflowDefinition;
        input?: Record<string, unknown>;
      };

      // Validate workflow structure (throws ApiError on failure)
      validateWorkflowDefinition(workflow);

      const result = await createWorkflowRun(app.db, {
        definition: workflow,
        input: input ?? {},
        userUuid: request.user.sub,
      });

      // Enqueue the job for async processing
      await app.workflowQueue.add(
        'execute-workflow',
        { workflowRunId: result.workflowRunId, userUuid: request.user.sub },
        { jobId: result.workflowRunId },
      );

      return reply.status(202).send({ success: true, data: result });
    },
  );

  /**
   * GET /workflows
   * Returns paginated list of workflow runs for the authenticated user.
   */
  app.get(
    '/workflows',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const query = request.query as {
        status?: string;
        page?: number;
        limit?: number;
      };
      const result = await listWorkflowRuns(app.db, request.user.sub, query);
      return reply.send({ success: true, data: result });
    },
  );

  /**
   * GET /workflows/:runId
   * Returns workflow execution status with per-stage progress.
   */
  app.get(
    '/workflows/:runId',
    { schema: workflowRunIdParamSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const status = await getWorkflowStatus(app.db, runId, request.user.sub);
      return reply.send({ success: true, data: status });
    },
  );

  /**
   * GET /workflows/:runId/result
   * Returns final output. Returns 404 if workflow not yet completed.
   */
  app.get(
    '/workflows/:runId/result',
    { schema: workflowRunIdParamSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const result = await getWorkflowResult(app.db, runId, request.user.sub);
      return reply.send({ success: true, data: result });
    },
  );
}
