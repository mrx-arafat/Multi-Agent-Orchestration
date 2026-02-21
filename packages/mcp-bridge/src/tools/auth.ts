/** Auth tools — whoami and API token listing. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MaofClient } from '../api-client.js';
import { ok, err } from '../helpers.js';

export function registerAuthTools(server: McpServer, client: MaofClient) {
  server.tool('whoami', 'Get the current authenticated user profile', {}, async () => {
    try {
      return ok(await client.get('/auth/me'));
    } catch (e) {
      return err(`whoami failed: ${(e as Error).message}`);
    }
  });

  server.tool('list_api_tokens', 'List all API tokens for the current user', {}, async () => {
    try {
      return ok(await client.get('/auth/api-tokens'));
    } catch (e) {
      return err(`list_api_tokens failed: ${(e as Error).message}`);
    }
  });
}
