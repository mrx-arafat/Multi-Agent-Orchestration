/** Workflow template tools. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { MaofClient } from '../api-client.js';
import { ok, err, buildQs } from '../helpers.js';

export function registerTemplatesTools(server: McpServer, client: MaofClient) {
  server.tool(
    'templates_list',
    'List available workflow templates',
    {
      category: z.string().optional().describe('Filter by category'),
      search: z.string().optional().describe('Search by name or description'),
    },
    async ({ category, search }) => {
      try {
        const qs = buildQs({ category, search });
        return ok(await client.get(`/templates${qs}`));
      } catch (e) {
        return err(`templates_list failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'templates_use',
    'Instantiate a workflow template (starts a workflow run)',
    {
      templateUuid: z.string().uuid().describe('UUID of the template to use'),
      input: z.record(z.unknown()).optional().describe('Optional input data for the template'),
    },
    async ({ templateUuid, input }) => {
      try {
        const body: Record<string, unknown> = {};
        if (input !== undefined) body['input'] = input;
        return ok(await client.post(`/templates/${templateUuid}/use`, body));
      } catch (e) {
        return err(`templates_use failed: ${(e as Error).message}`);
      }
    },
  );

  server.tool(
    'templates_create',
    'Create a new workflow template',
    {
      name: z.string().min(1).describe('Template name'),
      definition: z.record(z.unknown()).describe('Workflow definition object'),
      description: z.string().optional().describe('Template description'),
      category: z.string().optional().describe('Template category'),
      isPublic: z.boolean().optional().describe('Whether the template is public'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
    },
    async ({ name, definition, description, category, isPublic, tags }) => {
      try {
        const body: Record<string, unknown> = { name, definition };
        if (description !== undefined) body['description'] = description;
        if (category !== undefined) body['category'] = category;
        if (isPublic !== undefined) body['isPublic'] = isPublic;
        if (tags !== undefined) body['tags'] = tags;
        return ok(await client.post('/templates', body));
      } catch (e) {
        return err(`templates_create failed: ${(e as Error).message}`);
      }
    },
  );
}
