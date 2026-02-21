/** Agent registry management tools. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MaofClient } from '../api-client.js';
import { ok, err, buildQs } from '../helpers.js';

export function registerAgentsTools(server: McpServer, client: MaofClient) {
  server.tool(
    'agents_register',
    'Register a new agent with the platform',
    {
      agentId: z.string().min(1).describe('Unique agent identifier'),
      name: z.string().min(1).describe('Agent display name'),
      endpoint: z.string().url().describe('Agent webhook endpoint URL'),
      authToken: z.string().min(1).describe('Auth token for the agent endpoint'),
      capabilities: z.array(z.string()).optional().describe('Agent capabilities'),
      createTeam: z.boolean().optional().describe('Create a new team for the agent'),
      teamName: z.string().optional().describe('Team name (when createTeam is true)'),
    },
    async ({ agentId, name, endpoint, authToken, capabilities, createTeam, teamName }) => {
      try {
        const body: Record<string, unknown> = { agentId, name, endpoint, authToken };
        if (capabilities !== undefined) body['capabilities'] = capabilities;
        if (createTeam !== undefined) body['createTeam'] = createTeam;
        if (teamName !== undefined) body['teamName'] = teamName;
        return ok(await client.post('/agents/register', body));
      } catch (e) {
        return err(`agents_register failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'agents_list',
    'List registered agents',
    {
      capability: z.string().optional().describe('Filter by capability'),
      status: z.string().optional().describe('Filter by status (online, offline, degraded)'),
      page: z.number().int().min(1).optional().describe('Page number'),
      limit: z.number().int().min(1).max(100).optional().describe('Items per page'),
    },
    async ({ capability, status, page, limit }) => {
      try {
        const qs = buildQs({ capability, status, page, limit });
        return ok(await client.get(`/agents${qs}`));
      } catch (e) {
        return err(`agents_list failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'agents_get',
    'Get details of a specific agent',
    { agentUuid: z.string().uuid().describe('UUID of the agent') },
    async ({ agentUuid }) => {
      try {
        return ok(await client.get(`/agents/${agentUuid}`));
      } catch (e) {
        return err(`agents_get failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'agents_delete',
    'Delete / unregister an agent',
    { agentUuid: z.string().uuid().describe('UUID of the agent to delete') },
    async ({ agentUuid }) => {
      try {
        return ok(await client.delete(`/agents/${agentUuid}`));
      } catch (e) {
        return err(`agents_delete failed: ${(e as Error).message}`);
      }
    },
  );
}
