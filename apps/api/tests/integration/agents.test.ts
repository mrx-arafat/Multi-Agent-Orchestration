/**
 * Agent registration & discovery integration tests.
 * Tests POST /agents/register, GET /agents, GET /agents/:agentUuid, DELETE /agents/:agentUuid
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;
let authToken: string; // Bearer access token
let authToken2: string; // Second user's token (for ownership tests)

const agentPayload = {
  agentId: 'test-agent-001',
  name: 'Test Agent',
  description: 'A test agent for unit tests',
  endpoint: 'https://agent.example.com/api',
  authToken: 'super-secret-token',
  capabilities: ['text-generation', 'summarization'],
  maxConcurrentTasks: 3,
};

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

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();
  await pool.query(`
    TRUNCATE TABLE execution_logs, stage_executions, workflow_runs, agents, users
    RESTART IDENTITY CASCADE
  `);
  authToken = await loginAs('owner@maof.dev');
  authToken2 = await loginAs('other@maof.dev');
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
    TRUNCATE TABLE execution_logs, stage_executions, workflow_runs, agents
    RESTART IDENTITY CASCADE
  `);
});

describe('POST /agents/register', () => {
  it('should register an agent and return 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: agentPayload,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.agentId).toBe(agentPayload.agentId);
    expect(body.data.name).toBe(agentPayload.name);
    expect(body.data.capabilities).toEqual(agentPayload.capabilities);
    expect(body.data.agentUuid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    // auth_token_hash must NEVER be returned
    expect(body.data.authToken).toBeUndefined();
    expect(body.data.authTokenHash).toBeUndefined();
  });

  it('should return 401 without auth token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      payload: agentPayload,
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 409 for duplicate agentId', async () => {
    await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: agentPayload,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: agentPayload,
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().success).toBe(false);
  });

  it('should return 400 for missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { name: 'No ID Agent' }, // missing agentId, endpoint, authToken
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /agents', () => {
  beforeEach(async () => {
    // Register a couple of agents
    await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { ...agentPayload, agentId: 'agent-a', capabilities: ['text-generation'] },
    });
    await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { ...agentPayload, agentId: 'agent-b', capabilities: ['code-audit'] },
    });
  });

  it('should list all agents', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agents',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.agents)).toBe(true);
    expect(body.data.agents.length).toBe(2);
    expect(body.data.meta.total).toBe(2);
    // auth tokens must not be in list response
    body.data.agents.forEach((agent: Record<string, unknown>) => {
      expect(agent['authTokenHash']).toBeUndefined();
    });
  });

  it('should filter by capability', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agents?capability=text-generation',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.agents.length).toBe(1);
    expect(body.data.agents[0].agentId).toBe('agent-a');
  });

  it('should return 401 without auth', async () => {
    const res = await app.inject({ method: 'GET', url: '/agents' });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /agents/:agentUuid', () => {
  let agentUuid: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: agentPayload,
    });
    agentUuid = res.json().data.agentUuid as string;
  });

  it('should return agent details', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.agentUuid).toBe(agentUuid);
    expect(body.data.authTokenHash).toBeUndefined();
  });

  it('should return 404 for non-existent UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/agents/00000000-0000-0000-0000-000000000000',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('DELETE /agents/:agentUuid', () => {
  let agentUuid: string;

  beforeEach(async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: agentPayload,
    });
    agentUuid = res.json().data.agentUuid as string;
  });

  it('should soft-delete agent (owner only)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/agents/${agentUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);

    // Should return 404 after deletion
    const getRes = await app.inject({
      method: 'GET',
      url: `/agents/${agentUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('should return 403 when non-owner tries to delete', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/agents/${agentUuid}`,
      headers: { authorization: `Bearer ${authToken2}` },
    });

    expect(res.statusCode).toBe(403);
  });
});
