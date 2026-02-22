import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Load env for drizzle-kit CLI (runs outside Fastify)
config({ path: '../../.env' });

export default defineConfig({
  schema: [
    './src/db/schema/users.ts',
    './src/db/schema/agents.ts',
    './src/db/schema/workflow-runs.ts',
    './src/db/schema/stage-executions.ts',
    './src/db/schema/execution-logs.ts',
    './src/db/schema/api-tokens.ts',
    './src/db/schema/teams.ts',
    './src/db/schema/kanban-tasks.ts',
    './src/db/schema/agent-messages.ts',
    './src/db/schema/team-invitations.ts',
    './src/db/schema/workflow-templates.ts',
    './src/db/schema/notifications.ts',
    './src/db/schema/webhooks.ts',
    './src/db/schema/task-metrics.ts',
    './src/db/schema/approval-gates.ts',
    './src/db/schema/agent-memory.ts',
    './src/db/schema/resource-locks.ts',
    './src/db/schema/budgets.ts',
    './src/db/schema/agent-permissions.ts',
    './src/db/schema/agent-versions.ts',
    './src/db/schema/sandbox-runs.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    host: process.env['MAOF_DB_HOST'] ?? 'localhost',
    port: Number(process.env['MAOF_DB_PORT'] ?? 5432),
    database: process.env['MAOF_DB_NAME'] ?? 'maof_dev',
    user: process.env['MAOF_DB_USER'] ?? 'maof',
    password: process.env['MAOF_DB_PASSWORD'] ?? 'maof_dev_password',
    ssl: false,
  },
  verbose: true,
  strict: false,
});
