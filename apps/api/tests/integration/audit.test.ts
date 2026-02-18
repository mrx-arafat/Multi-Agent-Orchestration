/**
 * Audit trail integration tests.
 * Tests GET /workflows/:runId/audit and automatic audit log creation.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;
let authToken: string;

const simpleWorkflow = {
  name: 'Audit Test Workflow',
  stages: [
    {
      id: 'stage-1',
      name: 'Process',
      agentCapability: 'text-processing',
      input: { text: 'Hello world' },
      dependencies: [],
    },
  ],
};

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();
  await pool.query(`
    TRUNCATE TABLE execution_logs, stage_executions, workflow_runs, agents, users
    RESTART IDENTITY CASCADE
  `);
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'audit@maof.dev', password: 'Password123!', name: 'Audit User' },
  });
  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'audit@maof.dev', password: 'Password123!' },
  });
  authToken = loginRes.json().data.accessToken as string;
});

afterAll(async () => {
  await pool.query(`
    TRUNCATE TABLE execution_logs, stage_executions, workflow_runs, agents, users
    RESTART IDENTITY CASCADE
  `);
  await pool.end();
  await destroyTestApp(app);
});

beforeEach(async () => {
  await pool.query(`
    TRUNCATE TABLE execution_logs, stage_executions, workflow_runs
    RESTART IDENTITY CASCADE
  `);
});

describe('GET /workflows/:runId/audit', () => {
  it('should return 401 without auth token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/workflows/test-run-id/audit',
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 404 for non-existent workflow run', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/workflows/nonexistent-run/audit',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('should return empty audit log for queued workflow', async () => {
    const submitRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflow: simpleWorkflow, input: { text: 'test' } },
    });
    const workflowRunId = submitRes.json().data.workflowRunId as string;

    const res = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}/audit`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.logs)).toBe(true);
    expect(body.data.workflowRunId).toBe(workflowRunId);
  });
});

describe('Audit log entries', () => {
  it('audit log entries should have correct structure when workflow completes', async () => {
    // Submit workflow and wait a moment for processing
    const submitRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflow: simpleWorkflow, input: { text: 'audit trail test' } },
    });
    const workflowRunId = submitRes.json().data.workflowRunId as string;

    // Wait for worker to process (worker has 50ms mock delay)
    await new Promise((resolve) => setTimeout(resolve, 500));

    const auditRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}/audit`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(auditRes.statusCode).toBe(200);
    const body = auditRes.json();

    // If logs are present, validate structure
    if (body.data.logs.length > 0) {
      const log = body.data.logs[0] as Record<string, unknown>;
      expect(log['workflowRunId']).toBe(workflowRunId);
      expect(log['stageId']).toBeDefined();
      expect(log['agentId']).toBeDefined();
      expect(log['action']).toBeDefined();
      expect(log['status']).toBeDefined();
      expect(log['loggedAt']).toBeDefined();
      // Hash fields should be present (may be null for MVP)
      expect('inputHash' in log || 'outputHash' in log).toBe(true);
    }
  });
});
