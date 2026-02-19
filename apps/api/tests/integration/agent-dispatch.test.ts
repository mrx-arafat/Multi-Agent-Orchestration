/**
 * End-to-end agent dispatch integration test.
 * Spins up a dummy agent HTTP server, registers it with MAOF,
 * submits a workflow in real dispatch mode, and verifies:
 * - Agent receives the correct request
 * - Workflow completes successfully
 * - Stage outputs are recorded
 * - Audit trail entries are created
 *
 * Note: These tests use retry(3) because BullMQ workers from other test files
 * (sharing the singleFork process) may briefly compete for the same queue,
 * causing occasional "workflow not found" races. This is a test-only concern —
 * production runs a single worker process.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import { createDummyAgent, type DummyAgent } from '../helpers/dummy-agent.js';
import { _resetEnvCache } from '../../src/config/index.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;
let authToken: string;
let agent: DummyAgent;
let agentUuid: string;

const AGENT_AUTH_TOKEN = 'test-agent-secret-token-12345';

async function loginAs(email: string): Promise<string> {
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'Password123!', name: 'Test User' },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'Password123!' },
  });
  return (res.json().data.accessToken as string);
}

async function waitForWorkflow(workflowRunId: string, maxPollMs = 15000): Promise<string> {
  const pollInterval = 300;
  const maxAttempts = Math.ceil(maxPollMs / pollInterval);
  let status = 'queued';

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const res = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    status = res.json().data.status;
    if (status === 'completed' || status === 'failed') break;
  }

  return status;
}

beforeAll(async () => {
  // Start dummy agent
  agent = await createDummyAgent({
    onExecute: (body) => {
      const req = body as { stage_id: string; input: Record<string, unknown> };
      return {
        output: {
          result: `processed-${req.stage_id}`,
          receivedInput: req.input,
        },
      };
    },
  });

  // Configure app for real dispatch mode
  _resetEnvCache();
  process.env['MAOF_AGENT_DISPATCH_MODE'] = 'real';
  process.env['MAOF_NODE_ENV'] = 'test';
  process.env['MAOF_LOG_LEVEL'] = 'silent';
  process.env['MAOF_DB_NAME'] = 'maof_test';

  // Flush stale BullMQ keys BEFORE creating app (so queue/worker start clean)
  const { default: Redis } = await import('ioredis');
  const tmpRedis = new Redis({
    host: process.env['MAOF_REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['MAOF_REDIS_PORT'] ?? 6379),
    password: process.env['MAOF_REDIS_PASSWORD'] || undefined,
    maxRetriesPerRequest: 3,
  });
  const staleKeys = await tmpRedis.keys('bull:workflow-execution:*');
  if (staleKeys.length > 0) await tmpRedis.del(...staleKeys);
  const healthKeys = await tmpRedis.keys('bull:agent-health-checks:*');
  if (healthKeys.length > 0) await tmpRedis.del(...healthKeys);
  await tmpRedis.quit();

  app = await createTestApp({
    MAOF_AGENT_DISPATCH_MODE: 'real',
  });

  // Wait for BullMQ worker to establish its Redis connections
  await app.workflowWorker.waitUntilReady();

  pool = createTestPool();
  await pool.query(`
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);

  authToken = await loginAs('dispatch-test@maof.dev');

  // Register dummy agent once and set it online
  const res = await app.inject({
    method: 'POST',
    url: '/agents/register',
    headers: { authorization: `Bearer ${authToken}` },
    payload: {
      agentId: 'dummy-agent',
      name: 'Dummy Test Agent',
      endpoint: agent.url,
      authToken: AGENT_AUTH_TOKEN,
      capabilities: ['text-generation', 'code-audit'],
      maxConcurrentTasks: 10,
    },
  });
  agentUuid = res.json().data.agentUuid as string;
  await pool.query(`UPDATE agents SET status = 'online' WHERE agent_uuid = $1`, [agentUuid]);
});

afterAll(async () => {
  process.env['MAOF_AGENT_DISPATCH_MODE'] = 'mock';
  _resetEnvCache();

  await pool.query(`
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);
  await pool.end();
  await agent.close();
  await destroyTestApp(app);
});

describe('Real agent dispatch (end-to-end)', () => {
  it('should dispatch a single-stage workflow to the dummy agent', { retry: 3 }, async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: {
          name: 'Single Stage Dispatch Test',
          stages: [
            { id: 'analyze', name: 'Analyze Code', agentCapability: 'text-generation' },
          ],
        },
        input: { code: 'console.log("hello")' },
      },
    });

    expect(createRes.statusCode).toBe(202);
    const { workflowRunId } = createRes.json().data;

    const status = await waitForWorkflow(workflowRunId);
    expect(status).toBe('completed');

    // Verify agent received the request
    expect(agent.callCount).toBeGreaterThanOrEqual(1);

    // Verify audit trail
    const auditRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}/audit`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(auditRes.statusCode).toBe(200);
    const logs = auditRes.json().data.logs;
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs.some((l: Record<string, string>) => l.action === 'execute')).toBe(true);
  });

  it('should dispatch a multi-stage workflow with dependencies', { timeout: 30000, retry: 3 }, async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: {
          name: 'Multi-Stage Dispatch Test',
          stages: [
            { id: 'research', name: 'Research', agentCapability: 'text-generation' },
            { id: 'audit', name: 'Audit', agentCapability: 'code-audit', dependencies: ['research'] },
          ],
        },
      },
    });

    const { workflowRunId } = createRes.json().data;

    const status = await waitForWorkflow(workflowRunId, 20000);
    expect(status).toBe('completed');

    // Both stages should have executed
    const auditRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}/audit`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const execLogs = auditRes.json().data.logs.filter(
      (l: Record<string, string>) => l.action === 'execute',
    );
    expect(execLogs.length).toBe(2);
  });

  it('should handle agent health check on the dummy agent', async () => {
    const healthRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/health-check`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(healthRes.statusCode).toBe(200);
    const data = healthRes.json().data;
    expect(data.newStatus).toBe('online');
    expect(data.responseTimeMs).toBeGreaterThanOrEqual(0);
  });
});
