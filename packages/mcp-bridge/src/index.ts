#!/usr/bin/env node
/**
 * MAOF MCP Bridge Server — exposes the full MAOF API as MCP tools.
 *
 * User mode  (MAOF_API_URL + MAOF_API_TOKEN):       25 user-facing tools
 * Agent mode (+ MAOF_AGENT_UUID):                    + 10 agent-ops tools = 35 total
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, MaofClient } from './api-client.js';

// Tool registration modules
import { registerAuthTools } from './tools/auth.js';
import { registerTeamsTools } from './tools/teams.js';
import { registerKanbanTools } from './tools/kanban.js';
import { registerWorkflowsTools } from './tools/workflows.js';
import { registerAgentsTools } from './tools/agents.js';
import { registerTemplatesTools } from './tools/templates.js';
import { registerNotificationsTools } from './tools/notifications.js';
import { registerAgentOpsTools } from './tools/agent-ops.js';

// ---------- bootstrap ----------

const config = loadConfig();
const client = new MaofClient(config);

const server = new McpServer({ name: 'maof-mcp-bridge', version: '0.2.0' });

// Always register user-facing tools (25)
registerAuthTools(server, client);
registerTeamsTools(server, client);
registerKanbanTools(server, client);
registerWorkflowsTools(server, client);
registerAgentsTools(server, client);
registerTemplatesTools(server, client);
registerNotificationsTools(server, client);

// Conditionally register agent-ops tools (+10)
if (client.hasAgentUuid) {
  registerAgentOpsTools(server, client);
}

// ---------- start ----------

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${(e as Error).message}\n`);
  process.exit(1);
});
