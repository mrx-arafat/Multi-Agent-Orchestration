/**
 * Phase 10 Integration Tests
 *
 * Tests three features:
 *   1. Agent WebSocket enhancements (ws_connected, lastHeartbeat columns)
 *   2. Human-in-the-Loop Approval Gates (CRUD + agent request)
 *   3. A2A Protocol (Agent Card, JSON-RPC, task lifecycle)
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import { createTestApp, destroyTestApp } from './helpers/app.js';
import { createTestPool } from './helpers/db.js';

let app: FastifyInstance;
let pool: Pool;
let authToken: string;
let userUuid: string;
let teamUuid: string;
let agentUuid: string;

async function loginAs(email: string, password: string, name: string): Promise<{ token: string; userUuid: string }> {
  await app.inject({
    method: 'POST',
    url: '/auth/register',
    payload: { email, password, name },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password },
  });
  const body = res.json();
  return { token: body.data.accessToken, userUuid: body.data.user.userUuid };
}

async function registerAgent(token: string, opts: Record<string, unknown> = {}): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/agents/register',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      agentId: `phase10-agent-${Date.now()}`,
      name: 'Phase 10 Test Agent',
      endpoint: 'http://localhost:9999',
      authToken: 'test-token-123',
      capabilities: ['text.summarize', 'code.review'],
      createTeam: true,
      teamName: 'Phase 10 Test Team',
      ...opts,
    },
  });
  const body = res.json();
  return body.data.agentUuid;
}

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();

  await pool.query(`
    TRUNCATE TABLE approval_gates, webhook_deliveries, webhooks, task_metrics,
                   agent_messages, kanban_tasks, team_members, teams,
                   execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);

  const auth = await loginAs('phase10@maof.dev', 'Phase10Test2026', 'Phase 10 User');
  authToken = auth.token;
  userUuid = auth.userUuid;

  agentUuid = await registerAgent(authToken);

  // Get agent's team
  const agentRes = await app.inject({
    method: 'GET',
    url: `/agent-ops/agents/${agentUuid}/context`,
    headers: { authorization: `Bearer ${authToken}` },
  });
  teamUuid = agentRes.json().data.teamUuid;
});

afterAll(async () => {
  await pool.query(`
    TRUNCATE TABLE approval_gates, webhook_deliveries, webhooks, task_metrics,
                   agent_messages, kanban_tasks, team_members, teams,
                   execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);
  await pool.end();
  await destroyTestApp(app);
});

beforeEach(async () => {
  await pool.query(`TRUNCATE TABLE approval_gates, kanban_tasks RESTART IDENTITY CASCADE`);
});

// ═══════════════════════════════════════════════════════════════════════
// Feature 1: Agent WebSocket Schema Enhancements
// ═══════════════════════════════════════════════════════════════════════

describe('Feature 1: Agent WebSocket Schema', () => {
  it('should have ws_connected default to false for new agents', async () => {
    const result = await pool.query(
      `SELECT ws_connected, last_heartbeat FROM agents WHERE agent_uuid = $1`,
      [agentUuid],
    );
    expect(result.rows[0].ws_connected).toBe(false);
    expect(result.rows[0].last_heartbeat).toBeNull();
  });

  it('should allow updating ws_connected and last_heartbeat', async () => {
    const now = new Date();
    await pool.query(
      `UPDATE agents SET ws_connected = true, last_heartbeat = $1 WHERE agent_uuid = $2`,
      [now, agentUuid],
    );

    const result = await pool.query(
      `SELECT ws_connected, last_heartbeat FROM agents WHERE agent_uuid = $1`,
      [agentUuid],
    );
    expect(result.rows[0].ws_connected).toBe(true);
    expect(result.rows[0].last_heartbeat).toBeTruthy();

    // Reset for other tests
    await pool.query(
      `UPDATE agents SET ws_connected = false, last_heartbeat = NULL WHERE agent_uuid = $1`,
      [agentUuid],
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Feature 2: Human-in-the-Loop Approval Gates
// ═══════════════════════════════════════════════════════════════════════

describe('Feature 2: Approval Gates', () => {
  describe('POST /teams/:teamUuid/approvals', () => {
    it('should create an approval gate', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          title: 'Deploy to production',
          description: 'Approve production deployment of v2.0',
          context: { version: '2.0', env: 'production' },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.title).toBe('Deploy to production');
      expect(body.data.status).toBe('pending');
      expect(body.data.teamUuid).toBe(teamUuid);
      expect(body.data.gateUuid).toBeTruthy();
    });

    it('should create an approval gate with expiry', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          title: 'Urgent approval',
          expiresInMs: 3600000, // 1 hour
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.expiresAt).toBeTruthy();
    });

    it('should reject without authentication', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        payload: { title: 'Unauthenticated' },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('GET /teams/:teamUuid/approvals', () => {
    it('should list approval gates', async () => {
      // Create two gates
      await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { title: 'Gate 1' },
      });
      await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { title: 'Gate 2' },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.length).toBe(2);
    });

    it('should filter by status', async () => {
      await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { title: 'Pending gate' },
      });

      const res = await app.inject({
        method: 'GET',
        url: `/teams/${teamUuid}/approvals?status=approved`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.length).toBe(0);
    });
  });

  describe('GET /teams/:teamUuid/approvals/:gateUuid', () => {
    it('should get a single gate', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { title: 'Single gate test' },
      });
      const gateUuid = createRes.json().data.gateUuid;

      const res = await app.inject({
        method: 'GET',
        url: `/teams/${teamUuid}/approvals/${gateUuid}`,
        headers: { authorization: `Bearer ${authToken}` },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.gateUuid).toBe(gateUuid);
    });
  });

  describe('POST /teams/:teamUuid/approvals/:gateUuid/respond', () => {
    it('should approve a gate', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { title: 'Approve me' },
      });
      const gateUuid = createRes.json().data.gateUuid;

      const res = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals/${gateUuid}/respond`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { decision: 'approved', note: 'LGTM' },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.status).toBe('approved');
      expect(body.data.responseNote).toBe('LGTM');
      expect(body.data.respondedByUserUuid).toBe(userUuid);
      expect(body.data.respondedAt).toBeTruthy();
    });

    it('should reject a gate', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { title: 'Reject me' },
      });
      const gateUuid = createRes.json().data.gateUuid;

      const res = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals/${gateUuid}/respond`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { decision: 'rejected', note: 'Not ready' },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data.status).toBe('rejected');
    });

    it('should not allow double response', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { title: 'Already handled' },
      });
      const gateUuid = createRes.json().data.gateUuid;

      // First response
      await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals/${gateUuid}/respond`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { decision: 'approved' },
      });

      // Second response should fail
      const res = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals/${gateUuid}/respond`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { decision: 'rejected' },
      });

      expect(res.statusCode).toBe(409);
    });

    it('should reject unauthorized approver', async () => {
      const createRes = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          title: 'Restricted gate',
          approvers: ['00000000-0000-0000-0000-000000000001'], // Non-existent user
        },
      });
      const gateUuid = createRes.json().data.gateUuid;

      const res = await app.inject({
        method: 'POST',
        url: `/teams/${teamUuid}/approvals/${gateUuid}/respond`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { decision: 'approved' },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('POST /agent-ops/agents/:uuid/request-approval', () => {
    it('should allow an agent to request approval', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/agent-ops/agents/${agentUuid}/request-approval`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          title: 'Agent needs permission to delete data',
          description: 'This operation will remove all staging data.',
          expiresInMs: 300000, // 5 min
          context: { operation: 'delete_staging', records: 42 },
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.success).toBe(true);
      expect(body.data.title).toBe('Agent needs permission to delete data');
      expect(body.data.status).toBe('pending');
      expect(body.data.requestedByAgentUuid).toBe(agentUuid);
      expect(body.data.teamUuid).toBe(teamUuid);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Feature 3: A2A Protocol (Agent-to-Agent)
// ═══════════════════════════════════════════════════════════════════════

describe('Feature 3: A2A Protocol', () => {
  describe('GET /.well-known/agent.json', () => {
    it('should return a valid Agent Card', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/.well-known/agent.json',
      });

      expect(res.statusCode).toBe(200);
      const card = res.json();
      expect(card.name).toBe('MAOF Platform');
      expect(card.version).toBe('1.0.0');
      expect(card.capabilities).toEqual({
        streaming: true,
        pushNotifications: false,
        stateTransitionHistory: true,
      });
      expect(card.authentication.schemes).toContain('Bearer');
      expect(card.defaultInputModes).toContain('application/json');
      expect(card.skills).toBeInstanceOf(Array);
      expect(card.url).toContain('/a2a');
    });

    it('should include skills from registered agents', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/.well-known/agent.json',
      });

      const card = res.json();
      const skillIds = card.skills.map((s: { id: string }) => s.id);
      expect(skillIds).toContain('text.summarize');
      expect(skillIds).toContain('code.review');
    });
  });

  describe('GET /a2a/agents/:uuid/agent.json', () => {
    it('should return agent-specific card', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/a2a/agents/${agentUuid}/agent.json`,
      });

      expect(res.statusCode).toBe(200);
      const card = res.json();
      expect(card.name).toBe('Phase 10 Test Agent');
      expect(card.skills.length).toBe(2);
    });

    it('should return 404 for unknown agent', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/a2a/agents/00000000-0000-0000-0000-000000000099/agent.json',
      });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /a2a — JSON-RPC 2.0', () => {
    it('should reject invalid JSON-RPC request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/a2a',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { invalid: true },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error.code).toBe(-32600);
    });

    it('should return error for unknown method', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/a2a',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'unknown/method',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.error.code).toBe(-32601);
      expect(body.error.message).toContain('Method not found');
    });

    describe('message/send', () => {
      it('should create a task from A2A message', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/a2a',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            jsonrpc: '2.0',
            id: 'msg-1',
            method: 'message/send',
            params: {
              message: {
                role: 'user',
                parts: [{ type: 'text', text: 'Summarize this document' }],
              },
              skill: 'text.summarize',
            },
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.jsonrpc).toBe('2.0');
        expect(body.id).toBe('msg-1');
        expect(body.result.id).toBeTruthy();
        expect(body.result.status.state).toBe('submitted');
      });

      it('should reject message without parts', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/a2a',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            jsonrpc: '2.0',
            id: 'msg-2',
            method: 'message/send',
            params: {
              message: { role: 'user', parts: [] },
            },
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.error).toBeTruthy();
      });
    });

    describe('tasks/get', () => {
      it('should get task status by ID', async () => {
        // First create a task via message/send
        const createRes = await app.inject({
          method: 'POST',
          url: '/a2a',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            jsonrpc: '2.0',
            id: 'create-1',
            method: 'message/send',
            params: {
              message: {
                role: 'user',
                parts: [{ type: 'text', text: 'Review this code' }],
              },
              skill: 'code.review',
            },
          },
        });
        const taskId = createRes.json().result.id;

        // Get the task
        const res = await app.inject({
          method: 'POST',
          url: '/a2a',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            jsonrpc: '2.0',
            id: 'get-1',
            method: 'tasks/get',
            params: { id: taskId },
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.result.id).toBe(taskId);
        expect(body.result.status.state).toBe('submitted');
      });

      it('should return error for non-existent task', async () => {
        const res = await app.inject({
          method: 'POST',
          url: '/a2a',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            jsonrpc: '2.0',
            id: 'get-2',
            method: 'tasks/get',
            params: { id: '00000000-0000-0000-0000-000000000099' },
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.error).toBeTruthy();
      });
    });

    describe('tasks/cancel', () => {
      it('should cancel a task', async () => {
        // Create a task
        const createRes = await app.inject({
          method: 'POST',
          url: '/a2a',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            jsonrpc: '2.0',
            id: 'create-2',
            method: 'message/send',
            params: {
              message: {
                role: 'user',
                parts: [{ type: 'text', text: 'Task to cancel' }],
              },
            },
          },
        });
        const taskId = createRes.json().result.id;

        // Cancel it
        const res = await app.inject({
          method: 'POST',
          url: '/a2a',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            jsonrpc: '2.0',
            id: 'cancel-1',
            method: 'tasks/cancel',
            params: { id: taskId },
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.result.status.state).toBe('canceled');
      });

      it('should not cancel a completed task', async () => {
        // Create and complete a task directly via DB
        const createRes = await app.inject({
          method: 'POST',
          url: '/a2a',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            jsonrpc: '2.0',
            id: 'create-3',
            method: 'message/send',
            params: {
              message: {
                role: 'user',
                parts: [{ type: 'text', text: 'Already done task' }],
              },
            },
          },
        });
        const taskId = createRes.json().result.id;

        // Mark as done in DB
        await pool.query(
          `UPDATE kanban_tasks SET status = 'done', completed_at = NOW() WHERE task_uuid = $1`,
          [taskId],
        );

        const res = await app.inject({
          method: 'POST',
          url: '/a2a',
          headers: { authorization: `Bearer ${authToken}` },
          payload: {
            jsonrpc: '2.0',
            id: 'cancel-2',
            method: 'tasks/cancel',
            params: { id: taskId },
          },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json();
        expect(body.error).toBeTruthy();
        expect(body.error.code).toBe(409);
      });
    });
  });

  describe('POST /a2a — requires authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/a2a',
        payload: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tasks/get',
          params: { id: '00000000-0000-0000-0000-000000000001' },
        },
      });
      expect(res.statusCode).toBe(401);
    });
  });
});
