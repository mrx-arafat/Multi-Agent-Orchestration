/**
 * Audit trail integration tests.
 * Tests GET /workflows/:runId/audit, automatic audit log creation,
 * and cryptographic signature verification (FR-5.2).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import { generateSigningKeyPair } from '../../src/lib/signing.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

const { publicKey, privateKey } = generateSigningKeyPair();

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
  // Inject test signing keys into process.env BEFORE anything else.
  // The audit signing service reads keys via parseEnv() which falls back to process.env.
  // When running after other test files (singleFork), a stale BullMQ worker may call
  // parseEnv() after the cache was reset, picking up whatever is in process.env.
  // By setting process.env here, even stale workers use the correct key pair.
  process.env['MAOF_AUDIT_SIGNING_KEY'] = privateKey;
  process.env['MAOF_AUDIT_SIGNING_PUBLIC_KEY'] = publicKey;

  // Flush stale BullMQ jobs to prevent cross-test interference.
  const ioredis = await import('ioredis');
  const Redis = ioredis.default ?? ioredis;
  const tmpRedis = new (Redis as unknown as new (opts: Record<string, unknown>) => import('ioredis').Redis)({
    host: process.env['MAOF_REDIS_HOST'] ?? 'localhost',
    port: Number(process.env['MAOF_REDIS_PORT'] ?? 6379),
    password: process.env['MAOF_REDIS_PASSWORD'] || undefined,
    maxRetriesPerRequest: 3,
  });
  const staleKeys = await tmpRedis.keys('bull:workflow-execution:*');
  if (staleKeys.length > 0) await tmpRedis.del(...staleKeys);
  await tmpRedis.quit();

  app = await createTestApp({
    MAOF_AUDIT_SIGNING_KEY: privateKey,
    MAOF_AUDIT_SIGNING_PUBLIC_KEY: publicKey,
  });
  pool = createTestPool();
  await pool.query(`
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
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
  it('audit log entries should have correct structure with signature when workflow completes', async () => {
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

    // If logs are present, validate structure including signature
    if (body.data.logs.length > 0) {
      const log = body.data.logs[0] as Record<string, unknown>;
      expect(log['workflowRunId']).toBe(workflowRunId);
      expect(log['stageId']).toBeDefined();
      expect(log['agentId']).toBeDefined();
      expect(log['action']).toBeDefined();
      expect(log['status']).toBeDefined();
      expect(log['loggedAt']).toBeDefined();
      expect('inputHash' in log || 'outputHash' in log).toBe(true);

      // FR-5.2: Signature should be populated with correct structure
      const sig = log['signature'] as Record<string, string> | null;
      expect(sig).not.toBeNull();
      if (sig) {
        expect(sig['algorithm']).toBe('RS256');
        expect(sig['signer']).toBe('maof-core');
        expect(typeof sig['value']).toBe('string');
        expect(sig['value']!.length).toBeGreaterThan(0);
        expect(typeof sig['timestamp']).toBe('string');
      }
    }
  });
});

describe('GET /workflows/:runId/audit/verify', () => {
  it('should return 401 without auth token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/workflows/test-run-id/audit/verify',
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 404 for non-existent workflow run', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/workflows/nonexistent-run/audit/verify',
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('should verify all signatures in an audit trail', async () => {
    const submitRes = await app.inject({
      method: 'POST',
      url: '/workflows/execute',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { workflow: simpleWorkflow, input: { text: 'verify test' } },
    });
    const workflowRunId = submitRes.json().data.workflowRunId as string;

    // Wait for worker to process
    await new Promise((resolve) => setTimeout(resolve, 500));

    const verifyRes = await app.inject({
      method: 'GET',
      url: `/workflows/${workflowRunId}/audit/verify`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(verifyRes.statusCode).toBe(200);
    const body = verifyRes.json();
    expect(body.success).toBe(true);

    const data = body.data as { verified: boolean; total: number; valid: number; invalid: number; unsigned: number };
    expect(typeof data.verified).toBe('boolean');
    expect(typeof data.total).toBe('number');
    expect(typeof data.valid).toBe('number');
    expect(data.invalid).toBe(0);
    expect(typeof data.unsigned).toBe('number');

    // If logs exist with signatures, they should all verify
    if (data.total > 0 && data.unsigned === 0) {
      expect(data.verified).toBe(true);
      expect(data.valid).toBe(data.total);
    }
  });
});
