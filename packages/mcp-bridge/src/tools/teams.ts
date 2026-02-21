/** Teams management tools. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MaofClient } from '../api-client.js';
import { ok, err } from '../helpers.js';

export function registerTeamsTools(server: McpServer, client: MaofClient) {
  server.tool('teams_list', 'List all teams the current user belongs to', {}, async () => {
    try {
      return ok(await client.get('/teams'));
    } catch (e) {
      return err(`teams_list failed: ${(e as Error).message}`);
    }
  });

  server.tool(
    'teams_create',
    'Create a new team',
    {
      name: z.string().min(1).describe('Team name'),
      description: z.string().optional().describe('Team description'),
      maxAgents: z.number().int().min(1).optional().describe('Max agents allowed in this team'),
    },
    async ({ name, description, maxAgents }) => {
      try {
        const body: Record<string, unknown> = { name };
        if (description !== undefined) body['description'] = description;
        if (maxAgents !== undefined) body['maxAgents'] = maxAgents;
        return ok(await client.post('/teams', body));
      } catch (e) {
        return err(`teams_create failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'teams_get',
    'Get details of a specific team',
    { teamUuid: z.string().uuid().describe('UUID of the team') },
    async ({ teamUuid }) => {
      try {
        return ok(await client.get(`/teams/${teamUuid}`));
      } catch (e) {
        return err(`teams_get failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'teams_list_agents',
    'List all agents in a team',
    { teamUuid: z.string().uuid().describe('UUID of the team') },
    async ({ teamUuid }) => {
      try {
        return ok(await client.get(`/teams/${teamUuid}/agents`));
      } catch (e) {
        return err(`teams_list_agents failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'teams_add_agent',
    'Add an agent to a team',
    {
      teamUuid: z.string().uuid().describe('UUID of the team'),
      agentUuid: z.string().uuid().describe('UUID of the agent to add'),
    },
    async ({ teamUuid, agentUuid }) => {
      try {
        return ok(await client.post(`/teams/${teamUuid}/agents`, { agentUuid }));
      } catch (e) {
        return err(`teams_add_agent failed: ${(e as Error).message}`);
      }
    },
  );
}
