/**
 * Phase 2 integration tests.
 * Tests the Phase 2 features end-to-end:
 * - API token authentication (create, use, revoke)
 * - Agent activity endpoint (FR-5.3)
 * - Retry logic with dummy agents (failFirstN)
 * - Redis caching (stage outputs, agent capabilities)
 * - Fallback agent routing
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import { createDummyAgent, type DummyAgent } from '../helpers/dummy-agent.js';
import { _resetEnvCache } from '../../src/config/index.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;
let jwtToken: string;
let userUuid: string;

// ── Helpers ─────────────────────────────────────────────────────────────

async function registerAndLogin(email: string, appInstance?: FastifyInstance): Promise<{ token: string; userUuid: string }> {
  const target = appInstance ?? app;
  const regRes = await target.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'Password123!', name: 'Phase2 User' },
  });
  if (regRes.statusCode !== 201) {
    throw new Error(`Register failed for ${email}: ${regRes.statusCode} ${JSON.stringify(regRes.json())}`);
  }
  const res = await target.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'Password123!' },
  });
  const data = res.json().data;
  if (!data) throw new Error(`Login failed for ${email}: ${JSON.stringify(res.json())}`);
  return { token: data.accessToken, userUuid: data.user.userUuid };
}

async function registerAgent(
  token: string,
  agentId: string,
  agentUrl: string,
  capabilities: string[],
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/agents/register',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      agentId,
      name: `Agent ${agentId}`,
      endpoint: agentUrl,
      authToken: 'test-secret-token',
      capabilities,
      maxConcurrentTasks: 10,
    },
  });
  return res.json().data.agentUuid as string;
}

async function setAgentOnline(agentUuid: string): Promise<void> {
  await pool.query(`UPDATE agents SET status = 'online' WHERE agent_uuid = $1`, [agentUuid]);
}

async function waitForWorkflow(workflowRunId: string, token: string, maxMs = 15000): Promise<string> {
  const interval = 300;
  const maxAttempts = Math.ceil(maxMs / interval);

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    const res = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    const status = res.json().data.status;
    if (status === 'completed' || status === 'failed') return status;
  }

  return 'timeout';
}

// ── Setup/Teardown ──────────────────────────────────────────────────────

beforeAll(async () => {
  _resetEnvCache();
  process.env['MAOF_NODE_ENV'] = 'test';
  process.env['MAOF_LOG_LEVEL'] = 'silent';
  process.env['MAOF_DB_NAME'] = 'maof_test';

  // Flush stale BullMQ keys
  const ioredis = await import('ioredis');
  const RedisClient = ioredis.default as unknown as new (opts: Record<string, unknown>) => import('ioredis').default;
  const tmpRedis = new RedisClient({
    host: process.env['MAOF_REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['MAOF_REDIS_PORT'] ?? 6379),
    password: process.env['MAOF_REDIS_PASSWORD'] || undefined,
    maxRetriesPerRequest: 3,
  });
  const keys = await tmpRedis.keys('bull:*');
  if (keys.length > 0) await tmpRedis.del(...keys);
  await tmpRedis.quit();

  app = await createTestApp();
  pool = createTestPool();
});

afterAll(async () => {
  _resetEnvCache();
  await pool.query(`
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);
  await pool.end();
  await destroyTestApp(app);
});

beforeEach(async () => {
  // Restore env in case a retry test called _resetEnvCache()
  _resetEnvCache();
  process.env['MAOF_NODE_ENV'] = 'test';
  process.env['MAOF_LOG_LEVEL'] = 'silent';
  process.env['MAOF_DB_NAME'] = 'maof_test';

  await pool.query(`
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);
  const result = await registerAndLogin('phase2@maof.dev');
  jwtToken = result.token;
  userUuid = result.userUuid;
});

// ── API Token Auth Tests ────────────────────────────────────────────────

describe('API Token Authentication (Phase 2)', () => {
  it('should create an API token and return it once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/api-tokens',
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { name: 'CI Pipeline Token' },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.token).toMatch(/^maof_[0-9a-f]{64}$/);
    expect(data.metadata.name).toBe('CI Pipeline Token');
    expect(data.metadata.tokenPrefix).toMatch(/^maof_[0-9a-f]{8}$/);
  });

  it('should authenticate using an API token', async () => {
    // Create token
    const createRes = await app.inject({
      method: 'POST',
      url: '/auth/api-tokens',
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { name: 'Test Token' },
    });
    const apiToken = createRes.json().data.token;

    // Use API token to access a protected route
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${apiToken}` },
    });

    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().data.email).toBe('phase2@maof.dev');
  });

  it('should list API tokens without exposing plaintext', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/api-tokens',
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { name: 'Token A' },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/api-tokens',
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { name: 'Token B' },
    });

    const listRes = await app.inject({
      method: 'GET',
      url: '/auth/api-tokens',
      headers: { authorization: `Bearer ${jwtToken}` },
    });

    expect(listRes.statusCode).toBe(200);
    const tokens = listRes.json().data;
    expect(tokens).toHaveLength(2);
    // No plaintext token in list response
    expect(tokens[0].token).toBeUndefined();
    expect(tokens[0].tokenHash).toBeUndefined();
  });

  it('should revoke an API token and reject subsequent use', async () => {
    // Create token
    const createRes = await app.inject({
      method: 'POST',
      url: '/auth/api-tokens',
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: { name: 'Ephemeral Token' },
    });
    const { token: apiToken, metadata } = createRes.json().data;

    // Revoke it
    const revokeRes = await app.inject({
      method: 'DELETE',
      url: `/auth/api-tokens/${metadata.tokenId}`,
      headers: { authorization: `Bearer ${jwtToken}` },
    });
    expect(revokeRes.statusCode).toBe(200);

    // Try to use revoked token
    const meRes = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${apiToken}` },
    });
    expect(meRes.statusCode).toBe(401);
  });

  it('should create a token with expiry and scopes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/api-tokens',
      headers: { authorization: `Bearer ${jwtToken}` },
      payload: {
        name: 'Scoped Token',
        scopes: ['workflows:read', 'agents:read'],
        expiresInDays: 30,
      },
    });

    expect(res.statusCode).toBe(201);
    const metadata = res.json().data.metadata;
    expect(metadata.scopes).toEqual(['workflows:read', 'agents:read']);
    expect(metadata.expiresAt).toBeTruthy();
  });

  it('should reject invalid API tokens', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer maof_invalidtokenthatisnot64hexchars' },
    });
    expect(res.statusCode).toBe(401);
  });
});

// ── Agent Activity Tests ────────────────────────────────────────────────

describe('Agent Activity Endpoint (FR-5.3)', () => {
  it('should return empty activity for a new agent', async () => {
    const dummyAgent = await createDummyAgent();
    try {
      const agentUuid = await registerAgent(jwtToken, 'activity-agent', dummyAgent.url, ['testing']);

      const res = await app.inject({
        method: 'GET',
        url: `/agents/${agentUuid}/activity`,
        headers: { authorization: `Bearer ${jwtToken}` },
      });

      expect(res.statusCode).toBe(200);
      const data = res.json().data;
      expect(data.agentUuid).toBe(agentUuid);
      expect(data.activity).toHaveLength(0);
      expect(data.meta.total).toBe(0);
    } finally {
      await dummyAgent.close();
    }
  });

  it('should return 404 for non-existent agent', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agents/00000000-0000-0000-0000-000000000000/activity',
      headers: { authorization: `Bearer ${jwtToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('should return activity after workflow execution', { timeout: 20000, retry: 3 }, async () => {
    const dummyAgent = await createDummyAgent();
    try {
      // Set up for real dispatch
      _resetEnvCache();
      const realApp = await createTestApp({ MAOF_AGENT_DISPATCH_MODE: 'real' });
      await realApp.workflowWorker.waitUntilReady();

      // Register and login
      await realApp.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'activity2@maof.dev', password: 'Password123!', name: 'Activity User' },
      });
      const loginRes = await realApp.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'activity2@maof.dev', password: 'Password123!' },
      });
      const token = loginRes.json().data.accessToken;

      // Register agent and set online
      const regRes = await realApp.inject({
        method: 'POST',
        url: '/agents/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          agentId: 'activity-real-agent',
          name: 'Activity Real Agent',
          endpoint: dummyAgent.url,
          authToken: 'test-secret',
          capabilities: ['text-gen'],
          maxConcurrentTasks: 5,
        },
      });
      const aUuid = regRes.json().data.agentUuid;
      await pool.query(`UPDATE agents SET status = 'online' WHERE agent_uuid = $1`, [aUuid]);

      // Execute workflow
      const wfRes = await realApp.inject({
        method: 'POST',
        url: '/workflows/execute',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          workflow: {
            name: 'Activity Test Workflow',
            stages: [{ id: 'step1', name: 'Step 1', agentCapability: 'text-gen' }],
          },
        },
      });
      const runId = wfRes.json().data.workflowRunId;

      // Wait for completion
      for (let i = 0; i < 50; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const sRes = await realApp.inject({
          method: 'GET',
          url: `/workflows/${runId}`,
          headers: { authorization: `Bearer ${token}` },
        });
        if (sRes.json().data.status === 'completed') break;
      }

      // Check activity
      const actRes = await realApp.inject({
        method: 'GET',
        url: `/agents/${aUuid}/activity`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(actRes.statusCode).toBe(200);
      const actData = actRes.json().data;
      expect(actData.activity.length).toBeGreaterThanOrEqual(1);
      expect(actData.activity[0].action).toBe('execute');

      await destroyTestApp(realApp);
    } finally {
      await dummyAgent.close();
    }
  });
});

// ── Retry & Fallback Tests ──────────────────────────────────────────────

describe('Retry Logic with Dummy Agents (Phase 2)', () => {
  it('should retry on transient failure and succeed', { timeout: 30000, retry: 3 }, async () => {
    // Agent fails first 2 calls, then succeeds
    const retryAgent = await createDummyAgent({ failFirstN: 2 });
    try {
      _resetEnvCache();
      const realApp = await createTestApp({ MAOF_AGENT_DISPATCH_MODE: 'real' });
      await realApp.workflowWorker.waitUntilReady();

      // Register user
      await realApp.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'retry@maof.dev', password: 'Password123!', name: 'Retry User' },
      });
      const loginRes = await realApp.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'retry@maof.dev', password: 'Password123!' },
      });
      const token = loginRes.json().data.accessToken;

      // Register agent
      const regRes = await realApp.inject({
        method: 'POST',
        url: '/agents/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          agentId: 'retry-agent',
          name: 'Retry Agent',
          endpoint: retryAgent.url,
          authToken: 'test-secret',
          capabilities: ['retry-test'],
          maxConcurrentTasks: 10,
        },
      });
      const aUuid = regRes.json().data.agentUuid;
      await pool.query(`UPDATE agents SET status = 'online' WHERE agent_uuid = $1`, [aUuid]);

      // Execute workflow — should retry and eventually succeed
      const wfRes = await realApp.inject({
        method: 'POST',
        url: '/workflows/execute',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          workflow: {
            name: 'Retry Test',
            stages: [{
              id: 'task',
              name: 'Retryable Task',
              agentCapability: 'retry-test',
              retryConfig: { maxRetries: 3, backoffMs: 100 },
            }],
          },
        },
      });
      const runId = wfRes.json().data.workflowRunId;

      // Wait for completion
      let status = 'queued';
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const sRes = await realApp.inject({
          method: 'GET',
          url: `/workflows/${runId}`,
          headers: { authorization: `Bearer ${token}` },
        });
        status = sRes.json().data.status;
        if (status === 'completed' || status === 'failed') break;
      }

      expect(status).toBe('completed');
      // Agent should have been called 3 times (2 failures + 1 success)
      expect(retryAgent.callCount).toBe(3);

      // Verify audit trail has retry entries
      const auditRes = await realApp.inject({
        method: 'GET',
        url: `/workflows/${runId}/audit`,
        headers: { authorization: `Bearer ${token}` },
      });
      const logs = auditRes.json().data.logs;
      const retryLogs = logs.filter((l: Record<string, string>) => l.action === 'retry');
      expect(retryLogs.length).toBeGreaterThanOrEqual(1);

      await destroyTestApp(realApp);
    } finally {
      await retryAgent.close();
    }
  });

  it('should fail workflow when all retries exhausted on non-retryable error', { timeout: 20000, retry: 3 }, async () => {
    const failAgent = await createDummyAgent({
      simulateError: { code: 'INVALID_INPUT', message: 'Bad input', retryable: false },
    });
    try {
      _resetEnvCache();
      const realApp = await createTestApp({ MAOF_AGENT_DISPATCH_MODE: 'real' });
      await realApp.workflowWorker.waitUntilReady();

      await realApp.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'fail@maof.dev', password: 'Password123!', name: 'Fail User' },
      });
      const loginRes = await realApp.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'fail@maof.dev', password: 'Password123!' },
      });
      const token = loginRes.json().data.accessToken;

      const regRes = await realApp.inject({
        method: 'POST',
        url: '/agents/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          agentId: 'fail-agent',
          name: 'Failing Agent',
          endpoint: failAgent.url,
          authToken: 'test-secret',
          capabilities: ['will-fail'],
          maxConcurrentTasks: 10,
        },
      });
      const aUuid = regRes.json().data.agentUuid;
      await pool.query(`UPDATE agents SET status = 'online' WHERE agent_uuid = $1`, [aUuid]);

      const wfRes = await realApp.inject({
        method: 'POST',
        url: '/workflows/execute',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          workflow: {
            name: 'Fail Test',
            stages: [{ id: 'bad-step', name: 'Bad Step', agentCapability: 'will-fail' }],
          },
        },
      });
      const runId = wfRes.json().data.workflowRunId;

      let status = 'queued';
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const sRes = await realApp.inject({
          method: 'GET',
          url: `/workflows/${runId}`,
          headers: { authorization: `Bearer ${token}` },
        });
        status = sRes.json().data.status;
        if (status === 'completed' || status === 'failed') break;
      }

      expect(status).toBe('failed');
      // Non-retryable: only 1 call (no retries)
      expect(failAgent.callCount).toBe(1);

      await destroyTestApp(realApp);
    } finally {
      await failAgent.close();
    }
  });
});

// ── Fallback Agent Routing Tests ────────────────────────────────────────

describe('Fallback Agent Routing (Phase 2)', () => {
  it('should fall back to second agent when first permanently fails', { timeout: 30000, retry: 3 }, async () => {
    // Primary agent always fails (retryable), fallback agent succeeds
    const primaryAgent = await createDummyAgent({
      simulateError: { code: 'OVERLOADED', message: 'Agent overloaded', retryable: true },
    });
    const fallbackAgent = await createDummyAgent({
      onExecute: () => ({
        output: { result: 'fallback-succeeded', source: 'fallback-agent' },
      }),
    });

    try {
      _resetEnvCache();
      const realApp = await createTestApp({ MAOF_AGENT_DISPATCH_MODE: 'real' });
      await realApp.workflowWorker.waitUntilReady();

      await realApp.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { email: 'fallback@maof.dev', password: 'Password123!', name: 'Fallback User' },
      });
      const loginRes = await realApp.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'fallback@maof.dev', password: 'Password123!' },
      });
      const token = loginRes.json().data.accessToken;

      // Register both agents with same capability
      const reg1 = await realApp.inject({
        method: 'POST',
        url: '/agents/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          agentId: 'primary-agent',
          name: 'Primary (Failing)',
          endpoint: primaryAgent.url,
          authToken: 'test-secret',
          capabilities: ['fallback-test'],
          maxConcurrentTasks: 10,
        },
      });
      const reg2 = await realApp.inject({
        method: 'POST',
        url: '/agents/register',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          agentId: 'fallback-agent',
          name: 'Fallback (Working)',
          endpoint: fallbackAgent.url,
          authToken: 'test-secret',
          capabilities: ['fallback-test'],
          maxConcurrentTasks: 10,
        },
      });

      const uuid1 = reg1.json().data.agentUuid;
      const uuid2 = reg2.json().data.agentUuid;
      await pool.query(`UPDATE agents SET status = 'online' WHERE agent_uuid IN ($1, $2)`, [uuid1, uuid2]);

      // Execute workflow
      const wfRes = await realApp.inject({
        method: 'POST',
        url: '/workflows/execute',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          workflow: {
            name: 'Fallback Test',
            stages: [{
              id: 'step1',
              name: 'Step 1',
              agentCapability: 'fallback-test',
              retryConfig: { maxRetries: 2, backoffMs: 100 },
            }],
          },
        },
      });
      if (!wfRes.json().data) {
        throw new Error(`Workflow execute failed: ${JSON.stringify(wfRes.json())}`);
      }
      const runId = wfRes.json().data.workflowRunId;

      let status = 'queued';
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 300));
        const sRes = await realApp.inject({
          method: 'GET',
          url: `/workflows/${runId}`,
          headers: { authorization: `Bearer ${token}` },
        });
        status = sRes.json().data.status;
        if (status === 'completed' || status === 'failed') break;
      }

      expect(status).toBe('completed');

      // Fallback agent should have been called
      expect(fallbackAgent.callCount).toBeGreaterThanOrEqual(1);

      // Verify result comes from fallback
      const resultRes = await realApp.inject({
        method: 'GET',
        url: `/workflows/${runId}/result`,
        headers: { authorization: `Bearer ${token}` },
      });
      const output = resultRes.json().data.output;
      expect(output.source).toBe('fallback-agent');

      await destroyTestApp(realApp);
    } finally {
      await primaryAgent.close();
      await fallbackAgent.close();
    }
  });
});
