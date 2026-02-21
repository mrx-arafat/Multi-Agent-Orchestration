/** Workflow execution and monitoring tools. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MaofClient } from '../api-client.js';
import { ok, err, buildQs } from '../helpers.js';

const stageSchema = z.object({
  id: z.string().describe('Unique stage identifier'),
  agentCapability: z.string().describe('Required agent capability'),
  input: z.record(z.unknown()).describe('Stage input data'),
  dependsOn: z.array(z.string()).optional().describe('IDs of stages this depends on'),
});

const workflowSchema = z.object({
  name: z.string().min(1).describe('Workflow name'),
  stages: z.array(stageSchema).min(1).describe('Workflow stages'),
});

export function registerWorkflowsTools(server: McpServer, client: MaofClient) {
  server.tool(
    'workflow_execute',
    'Execute a new workflow',
    {
      workflow: workflowSchema.describe('Workflow definition with name and stages'),
      input: z.record(z.unknown()).optional().describe('Optional workflow-level input'),
    },
    async ({ workflow, input }) => {
      try {
        const body: Record<string, unknown> = { workflow };
        if (input !== undefined) body['input'] = input;
        return ok(await client.post('/workflows/execute', body));
      } catch (e) {
        return err(`workflow_execute failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'workflow_list',
    'List workflow runs',
    {
      status: z.string().optional().describe('Filter by status (e.g. completed, running, failed)'),
      page: z.number().int().min(1).optional().describe('Page number'),
      limit: z.number().int().min(1).max(100).optional().describe('Items per page'),
    },
    async ({ status, page, limit }) => {
      try {
        const qs = buildQs({ status, page, limit });
        return ok(await client.get(`/workflows${qs}`));
      } catch (e) {
        return err(`workflow_list failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'workflow_status',
    'Get the status and progress of a workflow run',
    { runId: z.string().uuid().describe('Workflow run ID') },
    async ({ runId }) => {
      try {
        return ok(await client.get(`/workflows/${runId}`));
      } catch (e) {
        return err(`workflow_status failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'workflow_result',
    'Get the final result/output of a completed workflow run',
    { runId: z.string().uuid().describe('Workflow run ID') },
    async ({ runId }) => {
      try {
        return ok(await client.get(`/workflows/${runId}/result`));
      } catch (e) {
        return err(`workflow_result failed: ${(e as Error).message}`);
      }
    },
  );
}
