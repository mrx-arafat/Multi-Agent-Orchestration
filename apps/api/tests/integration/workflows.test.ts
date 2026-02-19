/**
 * Workflow execution engine integration tests.
 * Tests POST /workflows/execute, GET /workflows/:runId, GET /workflows/:runId/result
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;
let authToken: string;

const twoStageWorkflow = {
  name: 'Test Workflow',
  stages: [
    {
      id: 'stage-1',
      name: 'Summarize',
      agentCapability: 'text-summarization',
      input: { text: '${workflow.input.text}' },
      dependencies: [],
    },
    {
      id: 'stage-2',
      name: 'Translate',
      agentCapability: 'text-translation',
      input: { text: '${stage-1.output.summary}', language: 'es' },
      dependencies: ['stage-1'],
    },
  ],
};

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();
  await pool.query(`
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);
  // Register test user
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'workflow@maof.dev', password: 'Password123!', name: 'Workflow User' },
  });
  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'workflow@maof.dev', password: 'Password123!' },
  });
  authToken = loginRes.json().data.accessToken as string;
});

afterAll(async () => {
  await pool.query(`
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
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

describe('POST /workflows/execute', () => {
  it('should accept a valid workflow and return 202 with runId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: twoStageWorkflow,
        input: { text: 'Hello world, this is a test document for summarization.' },
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.workflowRunId).toBeDefined();
    expect(body.data.status).toBe('queued');
    expect(typeof body.data.workflowRunId).toBe('string');
  });

  it('should return 400 for workflow with no stages', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: { name: 'Empty', stages: [] },
        input: {},
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('should return 400 for stage with invalid dependency reference', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: {
          name: 'Bad Deps',
          stages: [
            {
              id: 'stage-1',
              name: 'Bad Stage',
              agentCapability: 'test',
              input: {},
              dependencies: ['nonexistent-stage'],
            },
          ],
        },
        input: {},
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('should return 401 without auth token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      payload: { workflow: twoStageWorkflow, input: {} },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /workflows/:runId', () => {
  let workflowRunId: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflow: twoStageWorkflow, input: { text: 'test' } },
    });
    workflowRunId = res.json().data.workflowRunId as string;
  });

  it('should return workflow status', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.workflowRunId).toBe(workflowRunId);
    expect(['queued', 'in_progress', 'completed', 'failed']).toContain(body.data.status);
    expect(body.data.progress).toBeDefined();
    expect(typeof body.data.progress.total).toBe('number');
  });

  it('should return 404 for non-existent runId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/workflows/nonexistent-run-id-12345',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /workflows/:runId/result', () => {
  it('should return 404 for queued/in-progress workflow', async () => {
    const submitRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflow: twoStageWorkflow, input: { text: 'test' } },
    });
    const workflowRunId = submitRes.json().data.workflowRunId as string;

    // Immediately request result (workflow is queued, not done yet)
    // Depending on timing, may be queued or in_progress
    const res = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}/result`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    // Either 404 (not ready) or 200 (if worker completed very fast)
    expect([200, 404]).toContain(res.statusCode);
    if (res.statusCode === 404) {
      expect(res.json().success).toBe(false);
    }
  });
});
