/**
 * Memory store integration tests.
 * Tests POST /memory/:workflowRunId, GET /memory/:workflowRunId/:key,
 * DELETE /memory/:workflowRunId/:key, GET /memory/:workflowRunId
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;
let authToken: string;

const TEST_WORKFLOW_RUN_ID = 'wfr-memory-test-001';

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
  authToken = await loginAs('memory-test@maof.dev');
});

afterAll(async () => {
  // Clean up Redis memory keys
  const keys = await app.redis.keys('maof:memory:*');
  if (keys.length > 0) await app.redis.del(...keys);
  await destroyTestApp(app);
});

beforeEach(async () => {
  // Clean up test memory keys
  const keys = await app.redis.keys(`maof:memory:${TEST_WORKFLOW_RUN_ID}:*`);
  if (keys.length > 0) await app.redis.del(...keys);
});

describe('POST /memory/:workflowRunId', () => {
  it('should write a key-value pair and return 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { key: 'analysis-result', value: { score: 95, passed: true } },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.workflowRunId).toBe(TEST_WORKFLOW_RUN_ID);
    expect(body.data.key).toBe('analysis-result');
    expect(body.data.ttlSeconds).toBe(86400);
  });

  it('should accept custom ttlSeconds', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { key: 'temp-data', value: 'hello', ttlSeconds: 3600 },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.ttlSeconds).toBe(3600);
  });

  it('should return 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}`,
      payload: { key: 'test', value: 'data' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('should return 400 for missing key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { value: 'data' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('GET /memory/:workflowRunId/:key', () => {
  it('should read a previously written value', async () => {
    // Write first
    await app.inject({
      method: 'POST',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { key: 'read-test', value: { data: [1, 2, 3] } },
    });

    // Read
    const res = await app.inject({
      method: 'GET',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}/read-test`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.key).toBe('read-test');
    expect(body.data.value).toEqual({ data: [1, 2, 3] });
  });

  it('should return 404 for non-existent key', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}/nonexistent-key`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
  });
});

describe('DELETE /memory/:workflowRunId/:key', () => {
  it('should delete a key and return success', async () => {
    // Write first
    await app.inject({
      method: 'POST',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { key: 'delete-me', value: 'temporary' },
    });

    // Delete
    const res = await app.inject({
      method: 'DELETE',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}/delete-me`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.deleted).toBe(true);

    // Verify it's gone
    const getRes = await app.inject({
      method: 'GET',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}/delete-me`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it('should return 404 for non-existent key', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}/never-existed`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('GET /memory/:workflowRunId (list keys)', () => {
  it('should list all keys for a workflow run', async () => {
    // Write several keys
    await Promise.all([
      app.inject({
        method: 'POST',
        url: `/memory/${TEST_WORKFLOW_RUN_ID}`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { key: 'key-a', value: 'a' },
      }),
      app.inject({
        method: 'POST',
        url: `/memory/${TEST_WORKFLOW_RUN_ID}`,
        headers: { authorization: `Bearer ${authToken}` },
        payload: { key: 'key-b', value: 'b' },
      }),
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/memory/${TEST_WORKFLOW_RUN_ID}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.keys).toContain('key-a');
    expect(body.data.keys).toContain('key-b');
    expect(body.data.count).toBeGreaterThanOrEqual(2);
  });

  it('should return empty array when no keys exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/memory/wfr-empty-run',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.keys).toEqual([]);
    expect(res.json().data.count).toBe(0);
  });
});
