/**
 * RBAC (Role-Based Access Control) integration tests.
 * Verifies:
 * - Regular users can only access their own workflows
 * - Admin users can access any workflow
 * - requireRole preHandler works correctly
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;
let userToken: string;
let adminToken: string;
let userUuid: string;

async function registerAndLogin(email: string, role: 'user' | 'admin' = 'user'): Promise<{ token: string; userUuid: string }> {
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password: 'Password123!', name: 'Test User' },
  });

  // Update role directly in DB for admin
  if (role === 'admin') {
    await pool.query(`UPDATE users SET role = 'admin' WHERE email = $1`, [email]);
  }

  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: 'Password123!' },
  });

  const data = res.json().data;
  return { token: data.accessToken as string, userUuid: data.user.userUuid as string };
}

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();
  await pool.query(`
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);

  const user = await registerAndLogin('regular@maof.dev', 'user');
  userToken = user.token;
  userUuid = user.userUuid;

  const admin = await registerAndLogin('admin@maof.dev', 'admin');
  adminToken = admin.token;
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
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents
    RESTART IDENTITY CASCADE
  `);
});

const simpleWorkflow = {
  workflow: {
    name: 'RBAC Test Workflow',
    stages: [
      { id: 'stage-1', name: 'Step 1', agentCapability: 'test' },
    ],
  },
};

describe('Workflow ownership enforcement', () => {
  it('should allow user to access their own workflow', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${userToken}` },
      payload: simpleWorkflow,
    });
    const { workflowRunId } = createRes.json().data;

    const statusRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}`,
      headers: { authorization: `Bearer ${userToken}` },
    });

    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().data.workflowRunId).toBe(workflowRunId);
  });

  it('should deny non-owner access to a workflow', async () => {
    // User creates workflow
    const createRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${userToken}` },
      payload: simpleWorkflow,
    });
    const { workflowRunId } = createRes.json().data;

    // Another non-admin user tries to access (use admin but register as user)
    const other = await registerAndLogin('other@maof.dev', 'user');
    const statusRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}`,
      headers: { authorization: `Bearer ${other.token}` },
    });

    expect(statusRes.statusCode).toBe(403);
  });

  it('should allow admin to access any workflow', async () => {
    // User creates workflow
    const createRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${userToken}` },
      payload: simpleWorkflow,
    });
    const { workflowRunId } = createRes.json().data;

    // Admin accesses it
    const statusRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().data.workflowRunId).toBe(workflowRunId);
  });
});

describe('Audit trail RBAC', () => {
  it('should allow admin to access any audit trail', async () => {
    // User creates workflow
    const createRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${userToken}` },
      payload: simpleWorkflow,
    });
    const { workflowRunId } = createRes.json().data;

    // Admin accesses audit trail
    const auditRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}/audit`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(auditRes.statusCode).toBe(200);
    expect(auditRes.json().success).toBe(true);
  });
});

describe('requireRole preHandler', () => {
  it('should have requireRole decorator available on app', () => {
    expect(typeof app.requireRole).toBe('function');
    expect(typeof app.requireRole('admin')).toBe('function');
  });
});
