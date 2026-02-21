/** Agent-Ops tools — only registered when MAOF_AGENT_UUID is set. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MaofClient } from '../api-client.js';
import { ok, err } from '../helpers.js';

export function registerAgentOpsTools(server: McpServer, client: MaofClient) {
  const uuid = client.agentUuid;

  // 1. get_context
  server.tool(
    'get_context',
    "Get the agent's full operational context (team, pending tasks, inbox)",
    {},
    async () => {
      try {
        return ok(await client.get(`/agent-ops/agents/${uuid}/context`));
      } catch (e) {
        return err(`get_context failed: ${(e as Error).message}`);
      }
    },
  );

  // 2. list_tasks
  server.tool(
    'list_tasks',
    'List tasks for this agent',
    {
      filter: z
        .enum(['available', 'assigned', 'all'])
        .optional()
        .describe('Task filter (default: available)'),
    },
    async ({ filter }) => {
      try {
        const qs = filter ? `?filter=${filter}` : '';
        return ok(await client.get(`/agent-ops/agents/${uuid}/tasks${qs}`));
      } catch (e) {
        return err(`list_tasks failed: ${(e as Error).message}`);
      }
    },
  );

  // 3. report_status
  server.tool(
    'report_status',
    'Report agent status to MAOF',
    {
      status: z.enum(['online', 'degraded', 'offline']).describe('Agent status'),
      details: z.string().optional().describe('Optional status details'),
    },
    async ({ status, details }) => {
      try {
        const body: Record<string, unknown> = { status };
        if (details !== undefined) body['details'] = details;
        return ok(await client.post(`/agent-ops/agents/${uuid}/status`, body));
      } catch (e) {
        return err(`report_status failed: ${(e as Error).message}`);
      }
    },
  );

  // 4. start_task
  server.tool(
    'start_task',
    'Claim and start a task',
    { taskUuid: z.string().uuid().describe('UUID of the task to start') },
    async ({ taskUuid }) => {
      try {
        return ok(await client.post(`/agent-ops/agents/${uuid}/tasks/${taskUuid}/start`));
      } catch (e) {
        return err(`start_task failed: ${(e as Error).message}`);
      }
    },
  );

  // 5. complete_task
  server.tool(
    'complete_task',
    'Complete a task with its result',
    {
      taskUuid: z.string().uuid().describe('UUID of the task to complete'),
      result: z.string().min(1).describe('Task result / output'),
      review: z.boolean().optional().describe('Request peer review (default: false)'),
    },
    async ({ taskUuid, result, review }) => {
      try {
        const body: Record<string, unknown> = { result };
        if (review !== undefined) body['review'] = review;
        return ok(
          await client.post(`/agent-ops/agents/${uuid}/tasks/${taskUuid}/complete`, body),
        );
      } catch (e) {
        return err(`complete_task failed: ${(e as Error).message}`);
      }
    },
  );

  // 6. fail_task
  server.tool(
    'fail_task',
    'Report a task failure',
    {
      taskUuid: z.string().uuid().describe('UUID of the failed task'),
      error: z.string().min(1).describe('Error description'),
    },
    async ({ taskUuid, error: errorMsg }) => {
      try {
        return ok(
          await client.post(`/agent-ops/agents/${uuid}/tasks/${taskUuid}/fail`, {
            error: errorMsg,
          }),
        );
      } catch (e) {
        return err(`fail_task failed: ${(e as Error).message}`);
      }
    },
  );

  // 7. broadcast_message
  server.tool(
    'broadcast_message',
    'Broadcast a message to all team agents',
    {
      subject: z.string().min(1).describe('Message subject'),
      content: z.string().min(1).describe('Message body'),
      metadata: z.record(z.unknown()).optional().describe('Optional metadata object'),
    },
    async ({ subject, content, metadata }) => {
      try {
        const body: Record<string, unknown> = { subject, content };
        if (metadata !== undefined) body['metadata'] = metadata;
        return ok(await client.post(`/agent-ops/agents/${uuid}/broadcast`, body));
      } catch (e) {
        return err(`broadcast_message failed: ${(e as Error).message}`);
      }
    },
  );

  // 8. send_message
  server.tool(
    'send_message',
    'Send a direct message to another agent',
    {
      toAgentUuid: z.string().uuid().describe('UUID of the recipient agent'),
      subject: z.string().min(1).describe('Message subject'),
      content: z.string().min(1).describe('Message body'),
      metadata: z.record(z.unknown()).optional().describe('Optional metadata object'),
    },
    async ({ toAgentUuid, subject, content, metadata }) => {
      try {
        const body: Record<string, unknown> = { toAgentUuid, subject, content };
        if (metadata !== undefined) body['metadata'] = metadata;
        return ok(await client.post(`/agent-ops/agents/${uuid}/message`, body));
      } catch (e) {
        return err(`send_message failed: ${(e as Error).message}`);
      }
    },
  );

  // 9. read_inbox
  server.tool(
    'read_inbox',
    'Read inbox messages',
    {
      markAsRead: z.boolean().optional().describe('Mark messages as read (default: false)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Max messages to return (default: 20)'),
    },
    async ({ markAsRead, limit }) => {
      try {
        const params = new URLSearchParams();
        if (markAsRead !== undefined) params.set('markAsRead', String(markAsRead));
        if (limit !== undefined) params.set('limit', String(limit));
        const qs = params.toString() ? `?${params.toString()}` : '';
        return ok(await client.get(`/agent-ops/agents/${uuid}/inbox${qs}`));
      } catch (e) {
        return err(`read_inbox failed: ${(e as Error).message}`);
      }
    },
  );

  // 10. create_task (agent-ops shortcut — auto-resolves team)
  server.tool(
    'create_task',
    "Create a new kanban task in the agent's team board",
    {
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
    async ({ title, description, priority, tags, assignedAgentUuid }) => {
      try {
        const teamUuid = await client.getTeamUuid();
        const body: Record<string, unknown> = { title };
        if (description !== undefined) body['description'] = description;
        if (priority !== undefined) body['priority'] = priority;
        if (tags !== undefined) body['tags'] = tags;
        if (assignedAgentUuid !== undefined) body['assignedAgentUuid'] = assignedAgentUuid;
        return ok(await client.post(`/teams/${teamUuid}/kanban/tasks`, body));
      } catch (e) {
        return err(`create_task failed: ${(e as Error).message}`);
      }
    },
  );
}
