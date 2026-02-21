/** Kanban task management tools. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MaofClient } from '../api-client.js';
import { ok, err, buildQs } from '../helpers.js';

export function registerKanbanTools(server: McpServer, client: MaofClient) {
  server.tool(
    'kanban_create_task',
    'Create a new kanban task in a team board',
    {
      teamUuid: z.string().uuid().describe('UUID of the team'),
      title: z.string().min(1).describe('Task title'),
      description: z.string().optional().describe('Task description'),
      priority: z
        .enum(['low', 'medium', 'high', 'critical'])
        .optional()
        .describe('Priority (default: medium)'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
      assignedAgentUuid: z
        .string()
        .uuid()
        .optional()
        .describe('UUID of the agent to assign'),
    },
    async ({ teamUuid, title, description, priority, tags, assignedAgentUuid }) => {
      try {
        const body: Record<string, unknown> = { title };
        if (description !== undefined) body['description'] = description;
        if (priority !== undefined) body['priority'] = priority;
        if (tags !== undefined) body['tags'] = tags;
        if (assignedAgentUuid !== undefined) body['assignedAgentUuid'] = assignedAgentUuid;
        return ok(await client.post(`/teams/${teamUuid}/kanban/tasks`, body));
      } catch (e) {
        return err(`kanban_create_task failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'kanban_list_tasks',
    'List kanban tasks in a team board',
    {
      teamUuid: z.string().uuid().describe('UUID of the team'),
      status: z
        .enum(['backlog', 'todo', 'in_progress', 'review', 'done'])
        .optional()
        .describe('Filter by status'),
      tag: z.string().optional().describe('Filter by tag'),
      page: z.number().int().min(1).optional().describe('Page number'),
      limit: z.number().int().min(1).max(100).optional().describe('Items per page'),
    },
    async ({ teamUuid, status, tag, page, limit }) => {
      try {
        const qs = buildQs({ status, tag, page, limit });
        return ok(await client.get(`/teams/${teamUuid}/kanban/tasks${qs}`));
      } catch (e) {
        return err(`kanban_list_tasks failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'kanban_update_status',
    'Update the status of a kanban task',
    {
      teamUuid: z.string().uuid().describe('UUID of the team'),
      taskUuid: z.string().uuid().describe('UUID of the task'),
      status: z
        .enum(['backlog', 'todo', 'in_progress', 'review', 'done'])
        .describe('New status'),
      result: z.string().optional().describe('Result text (when completing a task)'),
    },
    async ({ teamUuid, taskUuid, status, result }) => {
      try {
        const body: Record<string, unknown> = { status };
        if (result !== undefined) body['result'] = result;
        return ok(
          await client.patch(`/teams/${teamUuid}/kanban/tasks/${taskUuid}/status`, body),
        );
      } catch (e) {
        return err(`kanban_update_status failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'kanban_claim_task',
    'Claim a kanban task for an agent',
    {
      teamUuid: z.string().uuid().describe('UUID of the team'),
      taskUuid: z.string().uuid().describe('UUID of the task'),
      agentUuid: z.string().uuid().describe('UUID of the agent claiming the task'),
    },
    async ({ teamUuid, taskUuid, agentUuid }) => {
      try {
        return ok(
          await client.post(`/teams/${teamUuid}/kanban/tasks/${taskUuid}/claim`, {
            agentUuid,
          }),
        );
      } catch (e) {
        return err(`kanban_claim_task failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'kanban_summary',
    'Get a summary of kanban task counts by status',
    { teamUuid: z.string().uuid().describe('UUID of the team') },
    async ({ teamUuid }) => {
      try {
        return ok(await client.get(`/teams/${teamUuid}/kanban/summary`));
      } catch (e) {
        return err(`kanban_summary failed: ${(e as Error).message}`);
      }
    },
  );
}
