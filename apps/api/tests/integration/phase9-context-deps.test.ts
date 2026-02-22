/**
 * Phase 9 Integration Tests — Context Store, Task Dependencies, Agent Delegation,
 * Structured Output, Streaming Progress, Retry/Timeout, Webhooks, Cost Tracking.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;
let authToken: string;
let userUuid: string;
let teamUuid: string;
let agentUuid1: string;
let agentUuid2: string;

const TRUNCATE_SQL = `
  TRUNCATE TABLE webhook_deliveries, webhooks, task_metrics,
                 agent_messages, kanban_tasks, team_members, teams,
                 execution_logs, stage_executions, workflow_runs,
                 agents, api_tokens, notifications, users
  RESTART IDENTITY CASCADE
`;

async function login(email: string): Promise<{ token: string; userUuid: string }> {
  await app.inject({ method: 'POST', url: '/auth/register', payload: { email, password: 'Password123!', name: 'Test' } });
  const res = await app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: 'Password123!' } });
  const data = res.json().data;
  return { token: data.accessToken, userUuid: data.user.userUuid };
}

async function createTeam(token: string, name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/teams',
    headers: { authorization: `Bearer ${token}` },
    payload: { name, description: 'Test team' },
  });
  return res.json().data.teamUuid;
}

async function registerAgent(token: string, id: string, teamUuid: string, caps: string[]): Promise<string> {
  const res = await app.inject({
    method: 'POST', url: '/agents/register',
    headers: { authorization: `Bearer ${token}` },
    payload: { agentId: id, name: `Agent ${id}`, endpoint: 'https://agent.example.com', authToken: 'secret', capabilities: caps, teamUuid },
  });
  return res.json().data.agentUuid;
}

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();
});

afterAll(async () => {
  await destroyTestApp(app);
  await pool.end();
});

beforeEach(async () => {
  await pool.query(TRUNCATE_SQL);
  const user = await login('phase9@maof.dev');
  authToken = user.token;
  userUuid = user.userUuid;
  teamUuid = await createTeam(authToken, 'Phase 9 Team');
  agentUuid1 = await registerAgent(authToken, 'agent-alpha', teamUuid, ['code.review', 'security.sast']);
  agentUuid2 = await registerAgent(authToken, 'agent-beta', teamUuid, ['report.generate']);
});

// ── Task Dependencies & Context Chaining ──────────────────────────────

describe('Task Dependencies & Context Store', () => {
  it('creates a task with dependsOn and inputMapping', async () => {
    // Create upstream task
    const t1Res = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Clone repo', tags: ['git.clone'] },
    });
    expect(t1Res.statusCode).toBe(201);
    const t1Uuid = t1Res.json().data.taskUuid;

    // Create downstream task with dependency
    const t2Res = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Run SAST scan',
        tags: ['security.sast'],
        dependsOn: [t1Uuid],
        inputMapping: { repoPath: `{{${t1Uuid}.output.path}}` },
      },
    });
    expect(t2Res.statusCode).toBe(201);
    const t2Data = t2Res.json().data;
    expect(t2Data.dependsOn).toEqual([t1Uuid]);
    expect(t2Data.inputMapping).toEqual({ repoPath: `{{${t1Uuid}.output.path}}` });
  });

  it('auto-promotes downstream task when upstream completes with output', async () => {
    // Create T1 (upstream)
    const t1Res = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Clone repo' },
    });
    const t1Uuid = t1Res.json().data.taskUuid;

    // Create T2 (downstream, depends on T1)
    const t2Res = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Scan repo',
        dependsOn: [t1Uuid],
        inputMapping: { target: `{{${t1Uuid}.output.repoPath}}` },
      },
    });
    const t2Uuid = t2Res.json().data.taskUuid;

    // T2 should start in backlog
    expect(t2Res.json().data.status).toBe('backlog');

    // Complete T1 with structured output
    await app.inject({
      method: 'PATCH', url: `/teams/${teamUuid}/kanban/tasks/${t1Uuid}/status`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { status: 'done', result: 'Cloned successfully', output: { repoPath: '/tmp/repo', commit: 'abc123' } },
    });

    // Wait briefly for async dependency resolution
    await new Promise((r) => setTimeout(r, 200));

    // T2 should now be 'todo' (auto-promoted)
    const t2Status = await app.inject({
      method: 'GET', url: `/teams/${teamUuid}/kanban/tasks?status=todo`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const todoTasks = t2Status.json().data.tasks;
    const t2Task = todoTasks.find((t: { taskUuid: string }) => t.taskUuid === t2Uuid);
    expect(t2Task).toBeDefined();
    expect(t2Task.status).toBe('todo');
  });

  it('returns task dependency context', async () => {
    const t1Res = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Step 1' },
    });
    const t1Uuid = t1Res.json().data.taskUuid;

    // Complete T1 with output
    await app.inject({
      method: 'PATCH', url: `/teams/${teamUuid}/kanban/tasks/${t1Uuid}/status`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { status: 'done', output: { summary: 'done', count: 42 } },
    });

    const t2Res = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Step 2',
        dependsOn: [t1Uuid],
        inputMapping: { data: `{{${t1Uuid}.output.summary}}` },
      },
    });
    const t2Uuid = t2Res.json().data.taskUuid;

    // Get dependency context
    const ctxRes = await app.inject({
      method: 'GET', url: `/teams/${teamUuid}/kanban/tasks/${t2Uuid}/context`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(ctxRes.statusCode).toBe(200);
    const ctx = ctxRes.json().data;
    expect(ctx.upstreamTasks).toHaveLength(1);
    expect(ctx.upstreamTasks[0].output).toEqual({ summary: 'done', count: 42 });
    expect(ctx.resolvedInput).toEqual({ data: 'done' });
  });
});

// ── Agent Task Delegation ─────────────────────────────────────────────

describe('Agent Task Delegation (A2A)', () => {
  it('agent delegates a subtask to another agent via capability', async () => {
    const res = await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/delegate`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Generate security report',
        description: 'Create PDF from scan findings',
        capability: 'report.generate',
        priority: 'high',
      },
    });
    expect(res.statusCode).toBe(201);
    const task = res.json().data;
    expect(task.tags).toContain('report.generate');
    expect(task.status).toBe('todo');
    expect(task.priority).toBe('high');
  });

  it('delegated task with dependencies starts as backlog', async () => {
    // Create parent task
    const t1Res = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Scan code' },
    });
    const t1Uuid = t1Res.json().data.taskUuid;

    // Delegate with dependency
    const res = await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/delegate`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Report from scan',
        capability: 'report.generate',
        dependsOn: [t1Uuid],
        inputMapping: { findings: `{{${t1Uuid}.output.findings}}` },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.status).toBe('backlog');
    expect(res.json().data.dependsOn).toEqual([t1Uuid]);
  });
});

// ── Structured Output ──────────────────────────────────────────────────

describe('Structured Task Output', () => {
  it('agent completes task with structured output via agent-ops', async () => {
    // Create a task
    const createRes = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Code review', tags: ['code.review'] },
    });
    const taskUuid = createRes.json().data.taskUuid;

    // Agent starts the task
    await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/tasks/${taskUuid}/start`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    // Agent completes with structured output
    const completeRes = await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/tasks/${taskUuid}/complete`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        result: '3 issues found',
        output: {
          type: 'code_review',
          summary: '3 issues found',
          findings: [
            { severity: 'high', file: 'auth.ts', line: 42, message: 'SQL injection' },
            { severity: 'medium', file: 'api.ts', line: 10, message: 'Missing rate limit' },
            { severity: 'low', file: 'utils.ts', line: 5, message: 'Unused import' },
          ],
          tokensUsed: 4500,
        },
      },
    });
    expect(completeRes.statusCode).toBe(200);
    const task = completeRes.json().data;
    expect(task.output).toBeDefined();
    expect(task.output.type).toBe('code_review');
    expect(task.output.findings).toHaveLength(3);
  });
});

// ── Streaming Progress ─────────────────────────────────────────────────

describe('Streaming Progress', () => {
  it('agent reports progress on a task', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Security scan', tags: ['security.sast'] },
    });
    const taskUuid = createRes.json().data.taskUuid;

    // Agent starts
    await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/tasks/${taskUuid}/start`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    // Agent reports progress
    const progressRes = await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/tasks/${taskUuid}/progress`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { step: 3, total: 5, message: 'Running dependency audit...' },
    });
    expect(progressRes.statusCode).toBe(200);
    expect(progressRes.json().data).toEqual({
      taskUuid,
      step: 3,
      total: 5,
      message: 'Running dependency audit...',
    });

    // Verify progress is persisted on the task
    const taskRes = await app.inject({
      method: 'GET', url: `/teams/${teamUuid}/kanban/tasks?assignedAgentUuid=${agentUuid1}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    const task = taskRes.json().data.tasks.find((t: { taskUuid: string }) => t.taskUuid === taskUuid);
    expect(task.progressCurrent).toBe(3);
    expect(task.progressTotal).toBe(5);
    expect(task.progressMessage).toBe('Running dependency audit...');
  });
});

// ── Task Retry Logic ───────────────────────────────────────────────────

describe('Task Retry & Dead Letter', () => {
  it('retries a task when retries are configured', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Flaky task', tags: ['code.review'], maxRetries: 2 },
    });
    const taskUuid = createRes.json().data.taskUuid;
    expect(createRes.json().data.maxRetries).toBe(2);

    // Agent claims and fails
    await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/tasks/${taskUuid}/start`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const failRes = await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/tasks/${taskUuid}/fail`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { error: 'Rate limited by API' },
    });
    expect(failRes.statusCode).toBe(200);
    const failData = failRes.json().data;
    expect(failData.status).toBe('todo'); // Re-queued, not dead
    expect(failData.retryCount).toBe(1);
    expect(failData.maxRetries).toBe(2);
  });

  it('moves to dead letter after exhausting retries', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Always fails', tags: ['code.review'], maxRetries: 0 },
    });
    const taskUuid = createRes.json().data.taskUuid;

    // Claim and fail (0 retries means first failure is dead letter)
    await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/tasks/${taskUuid}/start`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    const failRes = await app.inject({
      method: 'POST', url: `/agent-ops/agents/${agentUuid1}/tasks/${taskUuid}/fail`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { error: 'Permanent failure' },
    });
    expect(failRes.statusCode).toBe(200);
    expect(failRes.json().data.status).toBe('done'); // Dead letter
    expect(failRes.json().data.retryCount).toBe(1);
  });
});

// ── Webhooks ────────────────────────────────────────────────────────────

describe('Webhooks', () => {
  it('creates, lists, updates, and deletes webhooks', async () => {
    // Create
    const createRes = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/webhooks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        url: 'https://hooks.example.com/maof',
        events: ['task:completed', 'workflow:failed'],
        description: 'Slack integration',
      },
    });
    expect(createRes.statusCode).toBe(201);
    const webhook = createRes.json().data;
    expect(webhook.webhookUuid).toBeDefined();
    expect(webhook.secret).toBeDefined(); // Secret returned only on creation
    expect(webhook.events).toEqual(['task:completed', 'workflow:failed']);
    expect(webhook.active).toBe(true);

    // List
    const listRes = await app.inject({
      method: 'GET', url: `/teams/${teamUuid}/webhooks`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data).toHaveLength(1);

    // Update
    const updateRes = await app.inject({
      method: 'PATCH', url: `/teams/${teamUuid}/webhooks/${webhook.webhookUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { active: false },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.active).toBe(false);

    // Delete
    const deleteRes = await app.inject({
      method: 'DELETE', url: `/teams/${teamUuid}/webhooks/${webhook.webhookUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    // Verify deleted
    const listRes2 = await app.inject({
      method: 'GET', url: `/teams/${teamUuid}/webhooks`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(listRes2.json().data).toHaveLength(0);
  });

  it('lists webhook deliveries', async () => {
    const createRes = await app.inject({
      method: 'POST', url: `/teams/${teamUuid}/webhooks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { url: 'https://hooks.example.com/maof', events: ['task:created'] },
    });
    const webhookUuid = createRes.json().data.webhookUuid;

    const deliveriesRes = await app.inject({
      method: 'GET', url: `/teams/${teamUuid}/webhooks/${webhookUuid}/deliveries`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(deliveriesRes.statusCode).toBe(200);
    expect(Array.isArray(deliveriesRes.json().data)).toBe(true);
  });
});

// ── Cost Tracking / Metrics ────────────────────────────────────────────

describe('Cost Tracking & Metrics', () => {
  it('records and queries cost metrics', async () => {
    // Record a metric
    const recordRes = await app.inject({
      method: 'POST', url: '/metrics',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        teamUuid,
        agentId: 'agent-alpha',
        agentUuid: agentUuid1,
        tokensUsed: 5000,
        promptTokens: 3000,
        completionTokens: 2000,
        costCents: 15,
        latencyMs: 2500,
        provider: 'openai',
        model: 'gpt-4o',
        capability: 'code.review',
      },
    });
    expect(recordRes.statusCode).toBe(201);
    expect(recordRes.json().data.metricUuid).toBeDefined();

    // Record another metric
    await app.inject({
      method: 'POST', url: '/metrics',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        teamUuid,
        agentId: 'agent-beta',
        agentUuid: agentUuid2,
        tokensUsed: 2000,
        costCents: 5,
        latencyMs: 1000,
        provider: 'anthropic',
        model: 'claude-3-sonnet',
        capability: 'report.generate',
      },
    });

    // Query team cost summary
    const costRes = await app.inject({
      method: 'GET', url: `/teams/${teamUuid}/metrics/cost`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(costRes.statusCode).toBe(200);
    const cost = costRes.json().data;
    expect(cost.totalCostCents).toBe(20);
    expect(cost.totalTokens).toBe(7000);
    expect(cost.executionCount).toBe(2);

    // Query per-agent breakdown
    const agentRes = await app.inject({
      method: 'GET', url: `/teams/${teamUuid}/metrics/agents`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(agentRes.statusCode).toBe(200);
    const agents = agentRes.json().data;
    expect(agents).toHaveLength(2);
    // Sorted by cost DESC, so agent-alpha (15 cents) comes first
    expect(agents[0].agentId).toBe('agent-alpha');
    expect(agents[0].totalCostCents).toBe(15);

    // Query daily time series
    const dailyRes = await app.inject({
      method: 'GET', url: `/teams/${teamUuid}/metrics/daily`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(dailyRes.statusCode).toBe(200);
    expect(dailyRes.json().data.length).toBeGreaterThanOrEqual(1);
  });
});
