/**
 * Auth module integration tests.
 * Tests POST /auth/register, POST /auth/login, POST /auth/refresh
 * and JWT-protected route verification.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();
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
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams, execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
    RESTART IDENTITY CASCADE
  `);
});

describe('POST /auth/register', () => {
  it('should create a new user and return 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        email: 'user@maof.dev',
        password: 'Password123!',
        name: 'Test User',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('user@maof.dev');
    expect(body.data.name).toBe('Test User');
    expect(body.data.role).toBe('user');
    // Must not expose password hash
    expect(body.data.passwordHash).toBeUndefined();
    expect(body.data.password).toBeUndefined();
  });

  it('should return 409 for duplicate email', async () => {
    const payload = { email: 'dup@maof.dev', password: 'Password123!', name: 'User' };
    await app.inject({ method: 'POST', url: '/auth/register', payload });
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload });

    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('should return 400 for invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'Password123!', name: 'User' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('should return 400 for short password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'user@maof.dev', password: 'short', name: 'User' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /auth/login', () => {
  beforeEach(async () => {
    // Pre-register a user
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'login@maof.dev', password: 'Password123!', name: 'Login User' },
    });
  });

  it('should return tokens for valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'login@maof.dev', password: 'Password123!' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
    expect(typeof body.data.accessToken).toBe('string');
    expect(body.data.user.email).toBe('login@maof.dev');
  });

  it('should return 401 for wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'login@maof.dev', password: 'WrongPassword!' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });

  it('should return 401 for non-existent email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@maof.dev', password: 'Password123!' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('POST /auth/refresh', () => {
  let refreshToken: string;

  beforeEach(async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'refresh@maof.dev', password: 'Password123!', name: 'Refresh User' },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'refresh@maof.dev', password: 'Password123!' },
    });
    refreshToken = loginRes.json().data.refreshToken as string;
  });

  it('should return new token pair for valid refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.refreshToken).toBeDefined();
  });

  it('should return 401 for invalid refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: 'invalid.token.here' },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().success).toBe(false);
  });
});

describe('JWT middleware (app.authenticate)', () => {
  let accessToken: string;

  beforeEach(async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'protected@maof.dev', password: 'Password123!', name: 'Protected User' },
    });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'protected@maof.dev', password: 'Password123!' },
    });
    accessToken = loginRes.json().data.accessToken as string;
  });

  it('GET /auth/me should return current user when authenticated', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe('protected@maof.dev');
  });

  it('GET /auth/me should return 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('GET /auth/me should return 401 with invalid token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer invalid.jwt.token' },
    });
    expect(res.statusCode).toBe(401);
  });
});
