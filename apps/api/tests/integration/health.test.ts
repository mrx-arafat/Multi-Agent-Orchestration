import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestApp, destroyTestApp } from '../helpers/app.js';

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await destroyTestApp(app);
  });

  it('should return a valid health response with correct shape', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    // Status is 200 (ok) or 503 (degraded) depending on whether DB/Redis are connected
    expect([200, 503]).toContain(response.statusCode);
    const body = response.json<{
      success: boolean;
      data: { status: string; timestamp: string; version: string; services: Record<string, string> };
    }>();
    expect(body.data.version).toBe('0.1.0');
    expect(body.data.timestamp).toBeDefined();
    expect(body.data.services).toBeDefined();
    // Status is always one of ok/degraded
    expect(['ok', 'degraded']).toContain(body.data.status);
  });

  it('should include database and redis in services', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
    });

    const body = response.json<{
      data: { services: { database: string; redis: string } };
    }>();
    // Services should be present (may be disconnected in test env without DB/Redis)
    expect(['connected', 'disconnected']).toContain(body.data.services.database);
    expect(['connected', 'disconnected']).toContain(body.data.services.redis);
  });

  it('should return 404 for unknown routes with error envelope', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/nonexistent-route',
    });

    expect(response.statusCode).toBe(404);
    const body = response.json<{ success: boolean; error: { code: string } }>();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
