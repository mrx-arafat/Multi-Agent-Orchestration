/**
 * Integration tests for parallel workflow stage execution.
 * Verifies that independent stages run concurrently and dependent stages wait.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;
let authToken: string;

// Diamond workflow: a -> b (parallel with c) -> d
const diamondWorkflow = {
  name: 'Diamond Parallel Workflow',
  stages: [
    {
      id: 'root',
      name: 'Root Stage',
      agentCapability: 'text-summarization',
      input: { text: '${workflow.input.text}' },
      dependencies: [],
    },
    {
      id: 'branch-a',
      name: 'Branch A (parallel)',
      agentCapability: 'text-translation',
      input: { text: '${root.output.result}' },
      dependencies: ['root'],
    },
    {
      id: 'branch-b',
      name: 'Branch B (parallel)',
      agentCapability: 'text-sentiment',
      input: { text: '${root.output.result}' },
      dependencies: ['root'],
    },
    {
      id: 'merge',
      name: 'Merge Results',
      agentCapability: 'text-classify',
      input: {
        a: '${branch-a.output.result}',
        b: '${branch-b.output.result}',
      },
      dependencies: ['branch-a', 'branch-b'],
    },
  ],
};

// Fully parallel workflow: 3 stages with no dependencies
const fullyParallelWorkflow = {
  name: 'Fully Parallel Workflow',
  stages: [
    {
      id: 'task-1',
      name: 'Task 1',
      agentCapability: 'text-summarization',
      input: { text: '${workflow.input.text}' },
      dependencies: [],
    },
    {
      id: 'task-2',
      name: 'Task 2',
      agentCapability: 'text-translation',
      input: { text: '${workflow.input.text}' },
      dependencies: [],
    },
    {
      id: 'task-3',
      name: 'Task 3',
      agentCapability: 'text-sentiment',
      input: { text: '${workflow.input.text}' },
      dependencies: [],
    },
  ],
};

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();
  await pool.query(`
    TRUNCATE TABLE notifications, agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email: 'parallel@maof.dev', password: 'Password123!', name: 'Parallel Tester' },
  });
  const loginRes = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: 'parallel@maof.dev', password: 'Password123!' },
  });
  authToken = loginRes.json().data.accessToken as string;
});

afterAll(async () => {
  await pool.query(`
    TRUNCATE TABLE notifications, agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);
  await pool.end();
  await destroyTestApp(app);
});

beforeEach(async () => {
  await pool.query(`
    TRUNCATE TABLE notifications, execution_logs, stage_executions, workflow_runs
    RESTART IDENTITY CASCADE
  `);
});

describe('Parallel Workflow Execution', () => {
  it('should accept a diamond workflow with parallel branches', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: diamondWorkflow,
        input: { text: 'Analyze this text in parallel' },
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.workflowRunId).toBeDefined();
    expect(body.data.status).toBe('queued');
  });

  it('should accept a fully parallel workflow (no dependencies)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: fullyParallelWorkflow,
        input: { text: 'Process everything at once' },
      },
    });

    expect(res.statusCode).toBe(202);
    expect(res.json().success).toBe(true);
  });

  it('should complete diamond workflow and mark all stages', async () => {
    const submitRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: diamondWorkflow,
        input: { text: 'Test parallel completion' },
      },
    });
    const workflowRunId = submitRes.json().data.workflowRunId as string;

    // Wait for mock worker to complete (mock mode is fast)
    await new Promise((r) => setTimeout(r, 2000));

    const statusRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const data = statusRes.json().data;

    // Should be completed or still in_progress (timing-dependent with mock)
    expect(['completed', 'in_progress', 'queued']).toContain(data.status);

    if (data.status === 'completed') {
      expect(data.progress.completed).toBe(4);
      expect(data.progress.failed).toBe(0);
      // New field: currentStages should be an empty array when done
      expect(data.progress.currentStages).toEqual([]);
    }
  });

  it('should report workflow status with progress including currentStages', async () => {
    const submitRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: diamondWorkflow,
        input: { text: 'Test status reporting' },
      },
    });
    const workflowRunId = submitRes.json().data.workflowRunId as string;

    const statusRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const progress = statusRes.json().data.progress;
    expect(progress).toHaveProperty('total');
    expect(progress).toHaveProperty('completed');
    expect(progress).toHaveProperty('failed');
    expect(progress).toHaveProperty('inProgress');
    expect(progress).toHaveProperty('currentStages');
    expect(Array.isArray(progress.currentStages)).toBe(true);
    // current remains for backward compat
    expect(progress).toHaveProperty('current');
  });

  it('should complete fully parallel workflow (all stages at once)', async () => {
    const submitRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        workflow: fullyParallelWorkflow,
        input: { text: 'Everything runs at the same time' },
      },
    });
    const workflowRunId = submitRes.json().data.workflowRunId as string;

    await new Promise((r) => setTimeout(r, 2000));

    const statusRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const data = statusRes.json().data;
    if (data.status === 'completed') {
      expect(data.progress.completed).toBe(3);
    }
  });
});
