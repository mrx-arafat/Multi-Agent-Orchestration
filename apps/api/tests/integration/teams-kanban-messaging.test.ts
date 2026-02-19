/**
 * Integration tests for team-based features:
 * - Teams CRUD & membership
 * - Kanban task board (team-scoped)
 * - Agent-to-agent messaging (team-scoped)
 * - Agent type (generic / openclaw) registration
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createTestApp, destroyTestApp } from '../helpers/app.js';
import { createTestPool } from '../helpers/db.js';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

let app: FastifyInstance;
let pool: Pool;
let authToken: string;
let authToken2: string;
let userUuid: string;
let userUuid2: string;

const TRUNCATE_SQL = `
  TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams,
                 execution_logs, stage_executions, workflow_runs, agents, api_tokens, users
  RESTART IDENTITY CASCADE
`;

async function loginAs(email: string): Promise<{ token: string; userUuid: string }> {
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
  return { token: data.accessToken as string, userUuid: data.user.userUuid as string };
}

async function createTeam(token: string, name: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/teams',
    headers: { authorization: `Bearer ${token}` },
    payload: { name, description: `Team ${name}` },
  });
  return res.json().data.teamUuid as string;
}

async function registerAgent(
  token: string,
  agentId: string,
  opts?: { agentType?: string; teamUuid?: string },
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/agents/register',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      agentId,
      name: `Agent ${agentId}`,
      endpoint: 'https://agent.example.com/api',
      authToken: 'agent-secret',
      capabilities: ['text-generation'],
      ...(opts?.agentType ? { agentType: opts.agentType } : {}),
      ...(opts?.teamUuid ? { teamUuid: opts.teamUuid } : {}),
    },
  });
  return res.json().data.agentUuid as string;
}

beforeAll(async () => {
  app = await createTestApp();
  pool = createTestPool();
  await pool.query(TRUNCATE_SQL);
  const user1 = await loginAs('team-owner@maof.dev');
  authToken = user1.token;
  userUuid = user1.userUuid;
  const user2 = await loginAs('team-member@maof.dev');
  authToken2 = user2.token;
  userUuid2 = user2.userUuid;
});

afterAll(async () => {
  await pool.query(TRUNCATE_SQL);
  await pool.end();
  await destroyTestApp(app);
});

beforeEach(async () => {
  // Clean team-scoped tables between tests but keep users
  await pool.query(`
    TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams,
                   execution_logs, stage_executions, workflow_runs, agents
    RESTART IDENTITY CASCADE
  `);
});

// ─── Teams ──────────────────────────────────────────────────────────────────

describe('Teams CRUD', () => {
  it('should create a team and return 201', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/teams',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { name: 'Alpha Team', description: 'First team' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Alpha Team');
    expect(body.data.ownerUserUuid).toBe(userUuid);
    expect(body.data.agentCount).toBe(0);
  });

  it('should list user teams', async () => {
    await createTeam(authToken, 'Team A');
    await createTeam(authToken, 'Team B');

    const res = await app.inject({
      method: 'GET',
      url: '/teams',
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.length).toBe(2);
  });

  it('should get team details', async () => {
    const teamUuid = await createTeam(authToken, 'Detail Team');

    const res = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.name).toBe('Detail Team');
  });

  it('should return 403 for non-member accessing team', async () => {
    const teamUuid = await createTeam(authToken, 'Private Team');

    const res = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}`,
      headers: { authorization: `Bearer ${authToken2}` },
    });

    expect(res.statusCode).toBe(403);
  });

  it('should add a member and allow access', async () => {
    const teamUuid = await createTeam(authToken, 'Shared Team');

    // Add user2 as member
    const addRes = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/members`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { userUuid: userUuid2, role: 'member' },
    });
    expect(addRes.statusCode).toBe(200);

    // User2 can now access
    const getRes = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}`,
      headers: { authorization: `Bearer ${authToken2}` },
    });
    expect(getRes.statusCode).toBe(200);
  });
});

describe('Team agents', () => {
  it('should add and list agents in a team', async () => {
    const teamUuid = await createTeam(authToken, 'Agent Team');
    const agentUuid = await registerAgent(authToken, 'team-agent-1');

    // Add agent to team
    const addRes = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/agents`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { agentUuid },
    });
    expect(addRes.statusCode).toBe(200);

    // List team agents
    const listRes = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}/agents`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().data.length).toBe(1);
    expect(listRes.json().data[0].agentUuid).toBe(agentUuid);
  });

  it('should remove agent from team', async () => {
    const teamUuid = await createTeam(authToken, 'Remove Team');
    const agentUuid = await registerAgent(authToken, 'removable-agent');

    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/agents`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { agentUuid },
    });

    const removeRes = await app.inject({
      method: 'DELETE',
      url: `/teams/${teamUuid}/agents/${agentUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(removeRes.statusCode).toBe(200);

    const listRes = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}/agents`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(listRes.json().data.length).toBe(0);
  });
});

// ─── Agent Type Registration ────────────────────────────────────────────────

describe('Agent type registration', () => {
  it('should register an OpenClaw agent with agentType', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        agentId: 'openclaw-1',
        name: 'OpenClaw Agent',
        endpoint: 'https://openclaw.example.com',
        authToken: 'oc-secret',
        capabilities: ['code-generation', 'testing'],
        agentType: 'openclaw',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.agentType).toBe('openclaw');
  });

  it('should default to generic agent type', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        agentId: 'generic-1',
        name: 'Generic Agent',
        endpoint: 'https://generic.example.com/api',
        authToken: 'gen-secret',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.agentType).toBe('generic');
  });
});

// ─── Auto-Team Creation on Agent Registration ───────────────────────────────

describe('Auto-team creation on agent registration', () => {
  beforeEach(async () => {
    await pool.query(TRUNCATE_SQL);
    const u = await loginAs('autoteam@test.com');
    authToken = u.token;
    userUuid = u.userUuid;
  });

  it('should auto-create a team when createTeam is true', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        agentId: 'auto-team-agent',
        name: 'Auto Team Agent',
        endpoint: 'https://agent.example.com',
        authToken: 'secret-token',
        createTeam: true,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.teamUuid).toBeTruthy();
    expect(body.team).toBeDefined();
    expect(body.team.teamUuid).toBe(body.data.teamUuid);
    expect(body.team.name).toBe("Auto Team Agent's Team");
  });

  it('should use custom team name when provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        agentId: 'custom-team-agent',
        name: 'Custom Team Agent',
        endpoint: 'https://agent2.example.com',
        authToken: 'secret-token-2',
        createTeam: true,
        teamName: 'My AI Squad',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.team.name).toBe('My AI Squad');
  });

  it('should make the registering user the team owner', async () => {
    const regRes = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        agentId: 'owner-check-agent',
        name: 'Owner Check Agent',
        endpoint: 'https://agent3.example.com',
        authToken: 'secret-token-3',
        createTeam: true,
      },
    });

    expect(regRes.statusCode).toBe(201);
    const teamUuid = regRes.json().team.teamUuid;

    // The registering user should be able to manage the team (only owner can)
    const teamRes = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(teamRes.statusCode).toBe(200);
    expect(teamRes.json().data.ownerUserUuid).toBe(userUuid);
  });

  it('should not create a team when createTeam is false', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        agentId: 'no-team-agent',
        name: 'No Team Agent',
        endpoint: 'https://agent4.example.com',
        authToken: 'secret-token-4',
        createTeam: false,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.data.teamUuid).toBeNull();
    expect(body.team).toBeUndefined();
  });

  it('should skip team creation when teamUuid is already provided', async () => {
    // First create a team manually
    const existingTeamUuid = await createTeam(authToken, 'Pre-existing Team');

    const res = await app.inject({
      method: 'POST',
      url: '/agents/register',
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        agentId: 'existing-team-agent',
        name: 'Existing Team Agent',
        endpoint: 'https://agent5.example.com',
        authToken: 'secret-token-5',
        createTeam: true,
        teamUuid: existingTeamUuid,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    // Should use the provided teamUuid, not create a new one
    expect(body.data.teamUuid).toBe(existingTeamUuid);
    expect(body.team).toBeUndefined();
  });
});

// ─── Kanban Task Board ──────────────────────────────────────────────────────

describe('Kanban task board', () => {
  let teamUuid: string;

  beforeEach(async () => {
    // Clean and set up team for kanban tests
    await pool.query(`
      TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams,
                     execution_logs, stage_executions, workflow_runs, agents
      RESTART IDENTITY CASCADE
    `);
    teamUuid = await createTeam(authToken, 'Kanban Team');
  });

  it('should create a task on the board', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        title: 'Implement login feature',
        description: 'Build OAuth2 login flow',
        priority: 'high',
        tags: ['frontend', 'auth'],
      },
    });

    expect(res.statusCode).toBe(201);
    const task = res.json().data;
    expect(task.title).toBe('Implement login feature');
    expect(task.status).toBe('backlog');
    expect(task.priority).toBe('high');
    expect(task.tags).toEqual(['frontend', 'auth']);
    expect(task.teamUuid).toBe(teamUuid);
  });

  it('should list tasks with filters', async () => {
    // Create tasks
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Task A', tags: ['backend'] },
    });
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Task B', tags: ['frontend'] },
    });

    // List all
    const allRes = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(allRes.json().data.tasks.length).toBe(2);

    // Filter by tag
    const tagRes = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}/kanban/tasks?tag=backend`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(tagRes.json().data.tasks.length).toBe(1);
    expect(tagRes.json().data.tasks[0].title).toBe('Task A');
  });

  it('should allow an agent to claim a task', async () => {
    // Register agent and add to team
    const agentUuid = await registerAgent(authToken, 'kanban-claimer');
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/agents`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { agentUuid },
    });

    // Create task
    const createRes = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Claimable task' },
    });
    const taskUuid = createRes.json().data.taskUuid;

    // Claim task
    const claimRes = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks/${taskUuid}/claim`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { agentUuid },
    });

    expect(claimRes.statusCode).toBe(200);
    const claimed = claimRes.json().data;
    expect(claimed.status).toBe('in_progress');
    expect(claimed.assignedAgentUuid).toBe(agentUuid);
    expect(claimed.startedAt).not.toBeNull();
  });

  it('should reject claim from agent not in team', async () => {
    const outsideAgent = await registerAgent(authToken, 'outside-agent');

    const createRes = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Restricted task' },
    });
    const taskUuid = createRes.json().data.taskUuid;

    const claimRes = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks/${taskUuid}/claim`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { agentUuid: outsideAgent },
    });

    expect(claimRes.statusCode).toBe(403);
  });

  it('should update task status through the workflow', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Status flow task' },
    });
    const taskUuid = createRes.json().data.taskUuid;

    // Move to done with result
    const doneRes = await app.inject({
      method: 'PATCH',
      url: `/teams/${teamUuid}/kanban/tasks/${taskUuid}/status`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { status: 'done', result: 'Feature implemented successfully' },
    });

    expect(doneRes.statusCode).toBe(200);
    expect(doneRes.json().data.status).toBe('done');
    expect(doneRes.json().data.result).toBe('Feature implemented successfully');
    expect(doneRes.json().data.completedAt).not.toBeNull();
  });

  it('should return board summary', async () => {
    // Create tasks in different statuses
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Backlog 1' },
    });
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Backlog 2' },
    });

    const summaryRes = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}/kanban/summary`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(summaryRes.statusCode).toBe(200);
    const summary = summaryRes.json().data;
    expect(summary.backlog).toBe(2);
    expect(summary.todo).toBe(0);
    expect(summary.in_progress).toBe(0);
    expect(summary.review).toBe(0);
    expect(summary.done).toBe(0);
  });

  it('should enforce team isolation on kanban', async () => {
    // Create task in team
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { title: 'Private task' },
    });

    // user2 (non-member) should not see tasks
    const res = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}/kanban/tasks`,
      headers: { authorization: `Bearer ${authToken2}` },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ─── Agent Messaging ────────────────────────────────────────────────────────

describe('Agent messaging', () => {
  let teamUuid: string;
  let agent1Uuid: string;
  let agent2Uuid: string;

  beforeEach(async () => {
    await pool.query(`
      TRUNCATE TABLE agent_messages, kanban_tasks, team_members, teams,
                     execution_logs, stage_executions, workflow_runs, agents
      RESTART IDENTITY CASCADE
    `);

    teamUuid = await createTeam(authToken, 'Messaging Team');
    agent1Uuid = await registerAgent(authToken, 'msg-agent-1');
    agent2Uuid = await registerAgent(authToken, 'msg-agent-2');

    // Add both agents to team
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/agents`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { agentUuid: agent1Uuid },
    });
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/agents`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { agentUuid: agent2Uuid },
    });
  });

  it('should send a direct message between agents', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        fromAgentUuid: agent1Uuid,
        toAgentUuid: agent2Uuid,
        messageType: 'direct',
        subject: 'Task handoff',
        content: 'Login feature is ready for QA review',
      },
    });

    expect(res.statusCode).toBe(201);
    const msg = res.json().data;
    expect(msg.fromAgentUuid).toBe(agent1Uuid);
    expect(msg.toAgentUuid).toBe(agent2Uuid);
    expect(msg.messageType).toBe('direct');
    expect(msg.content).toBe('Login feature is ready for QA review');
  });

  it('should send a broadcast message to the team', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        fromAgentUuid: agent1Uuid,
        messageType: 'broadcast',
        subject: 'Status update',
        content: 'Backend API is deployed to staging',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.messageType).toBe('broadcast');
    expect(res.json().data.toAgentUuid).toBeNull();
  });

  it('should list messages in agent inbox', async () => {
    // Send 2 messages to agent2
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { fromAgentUuid: agent1Uuid, toAgentUuid: agent2Uuid, content: 'Message 1' },
    });
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { fromAgentUuid: agent1Uuid, toAgentUuid: agent2Uuid, content: 'Message 2' },
    });

    const inboxRes = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}/messages/inbox/${agent2Uuid}`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(inboxRes.statusCode).toBe(200);
    expect(inboxRes.json().data.messages.length).toBe(2);
    expect(inboxRes.json().data.meta.total).toBe(2);
  });

  it('should list all team messages', async () => {
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { fromAgentUuid: agent1Uuid, messageType: 'broadcast', content: 'Team broadcast' },
    });
    await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { fromAgentUuid: agent2Uuid, toAgentUuid: agent1Uuid, content: 'Direct reply' },
    });

    const res = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.messages.length).toBe(2);
  });

  it('should mark message as read', async () => {
    const sendRes = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: { fromAgentUuid: agent1Uuid, toAgentUuid: agent2Uuid, content: 'Read me' },
    });
    const messageUuid = sendRes.json().data.messageUuid;

    const readRes = await app.inject({
      method: 'PATCH',
      url: `/teams/${teamUuid}/messages/${messageUuid}/read`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(readRes.statusCode).toBe(200);
    expect(readRes.json().data.readAt).not.toBeNull();
  });

  it('should reject message from agent not in team', async () => {
    const outsideAgent = await registerAgent(authToken, 'outside-msg-agent');

    const res = await app.inject({
      method: 'POST',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken}` },
      payload: {
        fromAgentUuid: outsideAgent,
        toAgentUuid: agent2Uuid,
        content: 'Should fail',
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('should enforce team isolation on messaging', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/teams/${teamUuid}/messages`,
      headers: { authorization: `Bearer ${authToken2}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
