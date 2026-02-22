/**
 * Phase 10: Enterprise Features Integration Tests
 * Tests all 7 new features: Memory, Conflict Resolution, Sandbox, Budget, RBAC, Versioning, Caching
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

const truncatePhase10Tables = async () => {
  await pool.query(`
    TRUNCATE TABLE agent_memory, resource_locks, budgets,
                   agent_permissions, agent_permission_logs,
                   agent_versions, sandbox_runs,
                   agent_messages, kanban_tasks, team_members, teams,
                   execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);
};

async function registerAndLogin(email: string): Promise<{ token: string; userUuid: string }> {
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
  const data = res.json().data;
  return { token: data.accessToken, userUuid: data.user.userUuid };
}

async function registerAgent(agentId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/agents/register',
    headers: { authorization: `Bearer ${authToken}` },
    payload: {
      agentId,
      name: `Agent ${agentId}`,
      endpoint: 'https://agent.example.com/api',
      authToken: 'super-secret-token',
      capabilities: ['text-generation', 'code-audit'],
    },
  });
  return res.json().data.agentUuid;
}

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();
  await truncatePhase10Tables();
  const user = await registerAndLogin('enterprise@maof.dev');
  authToken = user.token;
  userUuid = user.userUuid;
});

afterAll(async () => {
  await truncatePhase10Tables();
  await pool.end();
  await destroyTestApp(app);
});

// ─── 1. Agent Memory ───────────────────────────────────────────────

describe('Agent Memory', () => {
  let agentUuid: string;

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE agent_memory, agents RESTART IDENTITY CASCADE');
    agentUuid = await registerAgent('memory-agent-001');
  });

  it('should store an episodic memory', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        memoryType: 'episodic',
        title: 'Completed code review',
        content: 'Reviewed PR #123, found 3 security issues',
        category: 'code_review',
        importance: 8,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.memoryUuid).toBeDefined();
    expect(body.data.memoryType).toBe('episodic');
    expect(body.data.importance).toBe(8);
  });

  it('should store semantic memory with metadata', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        memoryType: 'semantic',
        title: 'User prefers TypeScript',
        content: 'This project uses strict TypeScript with exactOptionalPropertyTypes',
        category: 'coding_style',
        metadata: { language: 'typescript', strict: true },
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.memoryType).toBe('semantic');
  });

  it('should recall memories with filtering', async () => {
    // Store 2 memories
    await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { memoryType: 'episodic', title: 'Task A', content: 'Did task A', importance: 3 },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { memoryType: 'semantic', title: 'Fact B', content: 'Important fact', importance: 9 },
    });

    // Recall all
    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBe(2);

    // Recall with type filter
    const filteredRes = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/memory?memoryType=semantic`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(filteredRes.json().data.count).toBe(1);
    expect(filteredRes.json().data.memories[0].memoryType).toBe('semantic');
  });

  it('should recall memories with text search', async () => {
    await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { memoryType: 'episodic', title: 'Security audit', content: 'Found XSS vulnerability' },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { memoryType: 'episodic', title: 'Code review', content: 'All tests passing' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/memory?query=XSS`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.json().data.count).toBe(1);
    expect(res.json().data.memories[0].title).toBe('Security audit');
  });

  it('should delete a memory', async () => {
    const storeRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { memoryType: 'working', title: 'Temp', content: 'Temporary context' },
    });
    const memoryUuid = storeRes.json().data.memoryUuid;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/agents/${agentUuid}/memory/${memoryUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().data.deleted).toBe(true);
  });

  it('should get memory summary', async () => {
    await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { memoryType: 'episodic', title: 'A', content: 'A', category: 'review' },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/memory`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { memoryType: 'semantic', title: 'B', content: 'B', category: 'facts' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/memory/summary`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const summary = res.json().data;
    expect(summary.totalMemories).toBe(2);
    expect(summary.byType.episodic).toBe(1);
    expect(summary.byType.semantic).toBe(1);
  });
});

// ─── 2. Conflict Resolution ────────────────────────────────────────

describe('Conflict Resolution', () => {
  let agentUuid: string;

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE resource_locks, agents RESTART IDENTITY CASCADE');
    agentUuid = await registerAgent('lock-agent-001');
  });

  it('should acquire a lock', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resourceType: 'file',
        resourceId: 'src/index.ts',
        ownerAgentUuid: agentUuid,
        timeoutSeconds: 60,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.lockUuid).toBeDefined();
    expect(body.data.status).toBe('active');
  });

  it('should prevent double-locking by different agents', async () => {
    const agent2Uuid = await registerAgent('lock-agent-002');

    await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resourceType: 'file',
        resourceId: 'src/index.ts',
        ownerAgentUuid: agentUuid,
        timeoutSeconds: 60,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resourceType: 'file',
        resourceId: 'src/index.ts',
        ownerAgentUuid: agent2Uuid,
        timeoutSeconds: 60,
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('RESOURCE_LOCKED');
  });

  it('should allow same agent to re-acquire (idempotent)', async () => {
    await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resourceType: 'file',
        resourceId: 'src/index.ts',
        ownerAgentUuid: agentUuid,
        timeoutSeconds: 60,
      },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resourceType: 'file',
        resourceId: 'src/index.ts',
        ownerAgentUuid: agentUuid,
        timeoutSeconds: 120,
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.version).toBe(2);
  });

  it('should release a lock', async () => {
    const acquireRes = await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resourceType: 'database',
        resourceId: 'users.123',
        ownerAgentUuid: agentUuid,
      },
    });
    const lockUuid = acquireRes.json().data.lockUuid;

    const releaseRes = await app.inject({
      method: 'POST',
      url: `/locks/${lockUuid}/release`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { ownerAgentUuid: agentUuid },
    });

    expect(releaseRes.statusCode).toBe(200);
    expect(releaseRes.json().data.released).toBe(true);
  });

  it('should check lock status', async () => {
    await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resourceType: 'api',
        resourceId: '/users',
        ownerAgentUuid: agentUuid,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/locks/check?resourceType=api&resourceId=/users',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.locked).toBe(true);
  });

  it('should detect content hash conflicts', async () => {
    const acquireRes = await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        resourceType: 'file',
        resourceId: 'data.json',
        ownerAgentUuid: agentUuid,
        contentHash: 'abc123',
      },
    });
    const lockUuid = acquireRes.json().data.lockUuid;

    const conflictRes = await app.inject({
      method: 'POST',
      url: `/locks/${lockUuid}/detect-conflict`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { currentContentHash: 'xyz789' },
    });

    expect(conflictRes.statusCode).toBe(200);
    expect(conflictRes.json().data.conflict).toBe(true);
  });

  it('should list active locks', async () => {
    await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { resourceType: 'file', resourceId: 'a.ts', ownerAgentUuid: agentUuid },
    });
    await app.inject({
      method: 'POST',
      url: '/locks/acquire',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { resourceType: 'file', resourceId: 'b.ts', ownerAgentUuid: agentUuid },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/locks',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBe(2);
  });
});

// ─── 3. Sandbox/Staging ────────────────────────────────────────────

describe('Sandbox/Staging', () => {
  const workflow = {
    name: 'Test Pipeline',
    stages: [
      { id: 'research', agentCapability: 'research', input: { topic: 'AI safety' } },
      { id: 'analyze', agentCapability: 'code-audit', input: {}, dependencies: ['research'] },
    ],
  };

  it('should execute a dry-run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sandbox/dry-run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflow, input: { text: 'test' } },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.sandboxUuid).toBeDefined();
    expect(data.mode).toBe('dry_run');
    expect(data.status).toBe('completed');
    expect(data.simulatedOutput.totalStages).toBe(2);
    expect(data.simulatedOutput.parallelLevels).toBe(2);
    expect(data.estimatedCostCents).toBeDefined();
  });

  it('should detect side effects in dry-run', async () => {
    const dangerousWorkflow = {
      name: 'Dangerous Pipeline',
      stages: [
        { id: 'delete', agentCapability: 'data-analysis', input: { action: 'delete all records' } },
      ],
    };

    const res = await app.inject({
      method: 'POST',
      url: '/sandbox/dry-run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflow: dangerousWorkflow },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.sideEffectsBlocked).toBeDefined();
    expect(data.sideEffectsBlocked.length).toBeGreaterThan(0);
  });

  it('should execute a shadow run', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sandbox/shadow',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflowRunId: 'prod-run-001', workflow },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.mode).toBe('shadow');
  });

  it('should get sandbox run by UUID', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/sandbox/dry-run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflow },
    });
    const sandboxUuid = createRes.json().data.sandboxUuid;

    const getRes = await app.inject({
      method: 'GET',
      url: `/sandbox/${sandboxUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().data.sandboxUuid).toBe(sandboxUuid);
  });

  it('should list sandbox runs', async () => {
    await app.inject({
      method: 'POST',
      url: '/sandbox/dry-run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflow },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/sandbox',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBeGreaterThanOrEqual(1);
  });
});

// ─── 4. Budget Enforcement ─────────────────────────────────────────

describe('Budget Enforcement', () => {
  let agentUuid: string;

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE budgets, agents RESTART IDENTITY CASCADE');
    agentUuid = await registerAgent('budget-agent-001');
  });

  it('should create a budget', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        name: 'Agent Daily Budget',
        scope: 'agent',
        scopeUuid: agentUuid,
        maxCostCents: 1000,
        alertThresholdPercent: 80,
        actionAtLimit: 'pause',
        period: 'daily',
      },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.budgetUuid).toBeDefined();
    expect(data.maxCostCents).toBe(1000);
    expect(data.currentSpendCents).toBe(0);
  });

  it('should check budget (within limit)', async () => {
    await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        name: 'Test Budget',
        scope: 'agent',
        scopeUuid: agentUuid,
        maxCostCents: 1000,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/budgets/check?scope=agent&scopeUuid=${agentUuid}&additionalCostCents=500`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.allowed).toBe(true);
  });

  it('should block when budget exceeded', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        name: 'Tight Budget',
        scope: 'agent',
        scopeUuid: agentUuid,
        maxCostCents: 100,
        actionAtLimit: 'kill',
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/budgets/check?scope=agent&scopeUuid=${agentUuid}&additionalCostCents=200`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.allowed).toBe(false);
    expect(res.json().data.action).toBe('kill');
  });

  it('should return noBudgetSet when no budget exists', async () => {
    const randomUuid = '00000000-0000-0000-0000-000000000099';
    const res = await app.inject({
      method: 'GET',
      url: `/budgets/check?scope=agent&scopeUuid=${randomUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.json().data.noBudgetSet).toBe(true);
  });

  it('should list budgets', async () => {
    await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { name: 'Budget A', scope: 'agent', scopeUuid: agentUuid, maxCostCents: 500 },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/budgets',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBeGreaterThanOrEqual(1);
  });

  it('should update a budget', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { name: 'Updatable', scope: 'agent', scopeUuid: agentUuid, maxCostCents: 500 },
    });
    const budgetUuid = createRes.json().data.budgetUuid;

    const updateRes = await app.inject({
      method: 'PATCH',
      url: `/budgets/${budgetUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { maxCostCents: 2000, isActive: false },
    });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.maxCostCents).toBe(2000);
    expect(updateRes.json().data.isActive).toBe(false);
  });

  it('should delete a budget', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/budgets',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { name: 'Deletable', scope: 'agent', scopeUuid: agentUuid, maxCostCents: 100 },
    });
    const budgetUuid = createRes.json().data.budgetUuid;

    const delRes = await app.inject({
      method: 'DELETE',
      url: `/budgets/${budgetUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(delRes.statusCode).toBe(200);
    expect(delRes.json().data.deleted).toBe(true);
  });
});

// ─── 5. Agent RBAC ─────────────────────────────────────────────────

describe('Agent RBAC (Permissions)', () => {
  let agentUuid: string;

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE agent_permissions, agent_permission_logs, agents RESTART IDENTITY CASCADE');
    agentUuid = await registerAgent('rbac-agent-001');
  });

  it('should grant permissions to an agent', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: `/agents/${agentUuid}/permissions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        role: 'researcher',
        allowedCapabilities: ['research', 'text-generation'],
        canAccessProduction: false,
      },
    });

    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.role).toBe('researcher');
    expect(data.canAccessProduction).toBe(false);
  });

  it('should check permission (allowed)', async () => {
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentUuid}/permissions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        role: 'executor',
        allowedCapabilities: ['code-audit', 'text-generation'],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/permissions/check?capability=code-audit`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.allowed).toBe(true);
  });

  it('should deny permission for unlisted capability', async () => {
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentUuid}/permissions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        role: 'researcher',
        allowedCapabilities: ['research'],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/permissions/check?capability=deploy`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.allowed).toBe(false);
  });

  it('should deny permission for explicitly denied capability', async () => {
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentUuid}/permissions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        role: 'admin',
        deniedCapabilities: ['dangerous-operation'],
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/permissions/check?capability=dangerous-operation`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.json().data.allowed).toBe(false);
  });

  it('should allow all capabilities when no restrictions set', async () => {
    // No permissions granted = default executor, allow all
    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/permissions/check?capability=anything`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.json().data.allowed).toBe(true);
    expect(res.json().data.role).toBe('executor');
  });

  it('should get permission audit logs', async () => {
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentUuid}/permissions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { role: 'deployer' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/permissions/logs`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBeGreaterThanOrEqual(1);
  });

  it('should revoke permissions', async () => {
    await app.inject({
      method: 'PUT',
      url: `/agents/${agentUuid}/permissions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { role: 'admin' },
    });

    const res = await app.inject({
      method: 'DELETE',
      url: `/agents/${agentUuid}/permissions`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.revoked).toBe(true);
  });
});

// ─── 6. Agent Versioning & Rollback ────────────────────────────────

describe('Agent Versioning & Rollback', () => {
  let agentUuid: string;

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE agent_versions, agents RESTART IDENTITY CASCADE');
    agentUuid = await registerAgent('versioned-agent-001');
  });

  it('should create a new version', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        version: '1.0.0',
        endpoint: 'https://v1.agent.example.com/api',
        capabilities: ['text-generation'],
        releaseNotes: 'Initial release',
      },
    });

    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.versionUuid).toBeDefined();
    expect(data.version).toBe('1.0.0');
    expect(data.status).toBe('draft');
  });

  it('should prevent duplicate versions', async () => {
    await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { version: '1.0.0', endpoint: 'https://v1.agent.example.com/api' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { version: '1.0.0', endpoint: 'https://v1.agent.example.com/api' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('should promote version with direct strategy', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { version: '1.0.0', endpoint: 'https://v1.agent.example.com/api' },
    });
    const versionUuid = createRes.json().data.versionUuid;

    const promoteRes = await app.inject({
      method: 'POST',
      url: `/versions/${versionUuid}/promote`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { strategy: 'direct' },
    });

    expect(promoteRes.statusCode).toBe(200);
    expect(promoteRes.json().data.status).toBe('active');
    expect(promoteRes.json().data.trafficPercent).toBe(100);
  });

  it('should promote version with canary strategy', async () => {
    // Create and promote v1
    const v1Res = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { version: '1.0.0', endpoint: 'https://v1.agent.example.com/api' },
    });
    await app.inject({
      method: 'POST',
      url: `/versions/${v1Res.json().data.versionUuid}/promote`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { strategy: 'direct' },
    });

    // Create v2 and canary deploy
    const v2Res = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { version: '2.0.0', endpoint: 'https://v2.agent.example.com/api' },
    });

    const canaryRes = await app.inject({
      method: 'POST',
      url: `/versions/${v2Res.json().data.versionUuid}/promote`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { strategy: 'canary', trafficPercent: 20 },
    });

    expect(canaryRes.json().data.status).toBe('canary');
    expect(canaryRes.json().data.trafficPercent).toBe(20);
  });

  it('should rollback to previous version', async () => {
    // Create v1, promote, create v2, promote
    const v1Res = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { version: '1.0.0', endpoint: 'https://v1.agent.example.com/api' },
    });
    await app.inject({
      method: 'POST',
      url: `/versions/${v1Res.json().data.versionUuid}/promote`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { strategy: 'direct' },
    });

    const v2Res = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { version: '2.0.0', endpoint: 'https://v2.agent.example.com/api' },
    });
    await app.inject({
      method: 'POST',
      url: `/versions/${v2Res.json().data.versionUuid}/promote`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { strategy: 'direct' },
    });

    // Rollback
    const rollbackRes = await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/rollback`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(rollbackRes.statusCode).toBe(200);
    expect(rollbackRes.json().data.version).toBe('1.0.0');
    expect(rollbackRes.json().data.status).toBe('active');
  });

  it('should list all versions', async () => {
    await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { version: '1.0.0', endpoint: 'https://v1.agent.example.com/api' },
    });
    await app.inject({
      method: 'POST',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { version: '2.0.0', endpoint: 'https://v2.agent.example.com/api' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}/versions`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.count).toBe(2);
  });
});

// ─── 7. Caching Layer ──────────────────────────────────────────────

describe('Caching Layer', () => {
  beforeEach(async () => {
    // Flush result cache keys to prevent cross-test contamination
    await app.inject({
      method: 'POST',
      url: '/cache/invalidate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {},
    });
  });

  it('should cache and retrieve a result', async () => {
    // Store
    const storeRes = await app.inject({
      method: 'POST',
      url: '/cache',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        capability: 'research',
        input: { topic: 'AI safety' },
        output: { summary: 'AI safety is important', sources: 3 },
        agentId: 'research-bot',
        ttlSeconds: 3600,
      },
    });

    expect(storeRes.statusCode).toBe(201);
    expect(storeRes.json().data.cached).toBe(true);

    // Retrieve
    const lookupRes = await app.inject({
      method: 'GET',
      url: `/cache/lookup?capability=research&input=${encodeURIComponent(JSON.stringify({ topic: 'AI safety' }))}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(lookupRes.statusCode).toBe(200);
    expect(lookupRes.json().data.hit).toBe(true);
    expect(lookupRes.json().data.entry.output.summary).toBe('AI safety is important');
  });

  it('should return cache miss for unknown input', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cache/lookup?capability=research&input=${encodeURIComponent(JSON.stringify({ topic: 'quantum computing' }))}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.hit).toBe(false);
  });

  it('should invalidate cache entries', async () => {
    // Store
    await app.inject({
      method: 'POST',
      url: '/cache',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        capability: 'text-gen',
        input: { prompt: 'hello' },
        output: { text: 'world' },
        agentId: 'text-bot',
      },
    });

    // Invalidate
    const invalidateRes = await app.inject({
      method: 'POST',
      url: '/cache/invalidate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { capability: 'text-gen', input: { prompt: 'hello' } },
    });

    expect(invalidateRes.statusCode).toBe(200);
    expect(invalidateRes.json().data.invalidated).toBe(1);

    // Verify miss
    const lookupRes = await app.inject({
      method: 'GET',
      url: `/cache/lookup?capability=text-gen&input=${encodeURIComponent(JSON.stringify({ prompt: 'hello' }))}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(lookupRes.json().data.hit).toBe(false);
  });

  it('should get cache stats', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/cache/stats',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const stats = res.json().data;
    expect(stats).toHaveProperty('totalEntries');
    expect(stats).toHaveProperty('totalHits');
    expect(stats).toHaveProperty('totalMisses');
    expect(stats).toHaveProperty('hitRate');
  });

  it('should warm cache with pre-computed results', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cache/warm',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        entries: [
          { capability: 'warm-cap', input: { a: 1 }, output: { b: 2 }, agentId: 'bot' },
          { capability: 'warm-cap', input: { a: 2 }, output: { b: 3 }, agentId: 'bot' },
        ],
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.warmed).toBe(2);
  });
});
