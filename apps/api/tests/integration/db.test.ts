/**
 * Database layer integration tests.
 * Verifies schema correctness and basic Drizzle ORM operations.
 * Requires a running PostgreSQL instance (maof_test database).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { _resetEnvCache } from '../../src/config/index.js';
import { getDb, getPool, closePool } from '../../src/db/index.js';
import { users, agents, workflowRuns } from '../../src/db/schema/index.js';
import { eq } from 'drizzle-orm';
import { truncateAllTables } from '../helpers/db.js';

// Ensure env is loaded correctly for the test database
_resetEnvCache();
process.env['MAOF_DB_NAME'] = process.env['MAOF_DB_NAME'] ?? 'maof_test';

describe('Database Layer', () => {
  const pool = getPool();
  const db = getDb();

  beforeAll(async () => {
    // Verify DB is reachable
    await pool.query('SELECT 1');
    await truncateAllTables(pool);
  });

  afterAll(async () => {
    await truncateAllTables(pool);
    await closePool();
  });

  describe('users table', () => {
    it('should insert and retrieve a user', async () => {
      const rows = await db
        .insert(users)
        .values({
          email: 'test@maof.dev',
          passwordHash: '$2b$10$hashedpassword',
          name: 'Test User',
          role: 'user',
        })
        .returning();

      const inserted = rows[0];
      expect(inserted).toBeDefined();
      if (!inserted) return;
      expect(inserted.email).toBe('test@maof.dev');
      expect(inserted.name).toBe('Test User');
      expect(inserted.role).toBe('user');
      expect(inserted.userUuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(inserted.id).toBeGreaterThan(0);
      expect(inserted.createdAt).toBeInstanceOf(Date);
      expect(inserted.deletedAt).toBeNull();
    });

    it('should enforce unique email constraint', async () => {
      await db.insert(users).values({
        email: 'unique@maof.dev',
        passwordHash: 'hash',
        name: 'User 1',
      });

      await expect(
        db.insert(users).values({
          email: 'unique@maof.dev',
          passwordHash: 'hash',
          name: 'User 2',
        }),
      ).rejects.toThrow();
    });

    it('should support soft delete via deletedAt', async () => {
      const userRows = await db
        .insert(users)
        .values({
          email: 'softdelete@maof.dev',
          passwordHash: 'hash',
          name: 'Soft Delete User',
        })
        .returning();

      const user = userRows[0];
      if (!user) throw new Error('Expected user insert to return a row');

      await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id));

      const updatedRows = await db.select().from(users).where(eq(users.id, user.id));
      const updated = updatedRows[0];
      if (!updated) throw new Error('Expected user to exist after update');
      expect(updated.deletedAt).not.toBeNull();
    });
  });

  describe('agents table', () => {
    it('should insert an agent with capabilities array', async () => {
      const rows = await db
        .insert(agents)
        .values({
          agentId: 'agent-001',
          name: 'Test Agent',
          endpoint: 'https://api.example.com/agent',
          authTokenHash: '$2b$10$hashedtoken',
          capabilities: ['text-generation', 'summarization'],
          status: 'online',
        })
        .returning();

      const agent = rows[0];
      expect(agent).toBeDefined();
      if (!agent) return;
      expect(agent.agentId).toBe('agent-001');
      expect(agent.name).toBe('Test Agent');
      expect(agent.capabilities).toEqual(['text-generation', 'summarization']);
      expect(agent.status).toBe('online');
      expect(agent.agentUuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('should enforce unique agentId constraint', async () => {
      await db.insert(agents).values({
        agentId: 'unique-agent-id',
        name: 'Agent 1',
        endpoint: 'https://api.example.com/agent',
        authTokenHash: 'hash',
      });

      await expect(
        db.insert(agents).values({
          agentId: 'unique-agent-id',
          name: 'Agent 2',
          endpoint: 'https://api.example.com/agent2',
          authTokenHash: 'hash2',
        }),
      ).rejects.toThrow();
    });
  });

  describe('workflow_runs table', () => {
    it('should store workflow definition as jsonb', async () => {
      const userRows = await db
        .insert(users)
        .values({
          email: 'workflow-owner@maof.dev',
          passwordHash: 'hash',
          name: 'Workflow Owner',
        })
        .returning();

      const user = userRows[0];
      if (!user) throw new Error('Expected user insert to return a row');

      const workflowDef = {
        name: 'Test Workflow',
        stages: [{ id: 'stage-1', agentId: 'agent-1', action: 'summarize' }],
      };

      const runRows = await db
        .insert(workflowRuns)
        .values({
          workflowRunId: 'run-001',
          userUuid: user.userUuid,
          workflowName: 'My Workflow',
          workflowDefinition: workflowDef,
          input: { text: 'Hello world' },
          status: 'queued',
        })
        .returning();

      const run = runRows[0];
      expect(run).toBeDefined();
      if (!run) return;
      expect(run.status).toBe('queued');
      expect(run.workflowDefinition).toEqual(workflowDef);
      expect(run.input).toEqual({ text: 'Hello world' });
      expect(run.workflowRunId).toBe('run-001');
    });
  });

  describe('connectivity', () => {
    it('should execute raw SQL', async () => {
      const result = await pool.query<{ val: number }>('SELECT 1 AS val');
      expect(result.rows[0]?.val).toBe(1);
    });
  });
});
