/**
 * Agent Operations routes — the agent-first API surface.
 *
 * These endpoints are designed for autonomous agents to consume.
 * Every endpoint returns structured JSON that agents can parse programmatically.
 *
 * GET    /agent-ops/protocol                    — Operating instructions for agents
 * GET    /agent-ops/agents/:uuid/context        — Agent's full operational context
 * GET    /agent-ops/agents/:uuid/tasks          — Tasks available or assigned
 * POST   /agent-ops/agents/:uuid/tasks/:taskUuid/start    — Claim and start a task
 * POST   /agent-ops/agents/:uuid/tasks/:taskUuid/complete — Complete a task with result
 * POST   /agent-ops/agents/:uuid/tasks/:taskUuid/fail     — Report task failure
 * POST   /agent-ops/agents/:uuid/broadcast      — Broadcast message to team
 * POST   /agent-ops/agents/:uuid/message        — Send direct message to another agent
 * GET    /agent-ops/agents/:uuid/inbox          — Read inbox (unread messages)
 * POST   /agent-ops/agents/:uuid/status         — Report agent status
 */
import type { FastifyInstance } from 'fastify';
import { buildAgentProtocol } from './protocol.js';
import {
  getAgentContext,
  getAgentTasks,
  startTask,
  completeTask,
  failTask,
  broadcastMessage,
  sendDirectMessage,
  readInbox,
  reportStatus,
  delegateTask,
  updateTaskProgress,
} from './service.js';

const agentParamSchema = {
  params: {
    type: 'object',
    required: ['uuid'],
    properties: {
      uuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

const agentTaskParamSchema = {
  params: {
    type: 'object',
    required: ['uuid', 'taskUuid'],
    properties: {
      uuid: { type: 'string', format: 'uuid' },
      taskUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export async function agentOpsRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /agent-ops/protocol
   * Returns the full operating protocol for agents — machine-readable instructions.
   * No authentication required (agents need this to learn how to authenticate).
   */
  app.get('/agent-ops/protocol', async (_request, reply) => {
    // Gather all known capabilities from built-in agents
    const capabilities = [
      'text.summarize', 'text.translate', 'text.sentiment', 'text.classify',
      'research.web_search', 'research.fact_check', 'research.compare',
      'content.blog_post', 'content.email', 'content.social_media',
      'code.review', 'code.generate', 'code.explain', 'code.refactor',
      'data.extract', 'data.transform', 'data.analyze',
    ];

    const baseUrl = `${_request.protocol}://${_request.hostname}`;
    const protocol = buildAgentProtocol(baseUrl, capabilities);

    return reply.send({ success: true, data: protocol });
  });

  /**
   * GET /agent-ops/agents/:uuid/context
   * Returns everything an agent needs to know: its state, team, pending work, inbox.
   */
  app.get(
    '/agent-ops/agents/:uuid/context',
    { schema: agentParamSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { uuid } = request.params as { uuid: string };
      const context = await getAgentContext(app.db, uuid);
      return reply.send({ success: true, data: context });
    },
  );

  /**
   * GET /agent-ops/agents/:uuid/tasks
   * Returns tasks for the agent. Filter: ?filter=available|assigned|all
   */
  app.get(
    '/agent-ops/agents/:uuid/tasks',
    {
      schema: {
        ...agentParamSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            filter: { type: 'string', enum: ['available', 'assigned', 'all'], default: 'available' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid } = request.params as { uuid: string };
      const { filter } = request.query as { filter?: 'available' | 'assigned' | 'all' };
      const tasks = await getAgentTasks(app.db, uuid, filter ?? 'available');
      return reply.send({ success: true, data: { tasks, count: tasks.length } });
    },
  );

  /**
   * POST /agent-ops/agents/:uuid/tasks/:taskUuid/start
   * Agent claims and starts a task.
   */
  app.post(
    '/agent-ops/agents/:uuid/tasks/:taskUuid/start',
    { schema: agentTaskParamSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { uuid, taskUuid } = request.params as { uuid: string; taskUuid: string };
      const task = await startTask(app.db, uuid, taskUuid);
      return reply.send({ success: true, data: task });
    },
  );

  /**
   * POST /agent-ops/agents/:uuid/tasks/:taskUuid/complete
   * Agent completes a task with its result.
   * Body: { result: string, review?: boolean, output?: object }
   */
  app.post(
    '/agent-ops/agents/:uuid/tasks/:taskUuid/complete',
    {
      schema: {
        ...agentTaskParamSchema,
        body: {
          type: 'object',
          required: ['result'],
          properties: {
            result: { type: 'string', minLength: 1 },
            review: { type: 'boolean', default: false },
            output: { type: 'object' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid, taskUuid } = request.params as { uuid: string; taskUuid: string };
      const { result, review, output } = request.body as { result: string; review?: boolean; output?: Record<string, unknown> };
      const task = await completeTask(app.db, uuid, taskUuid, result, review, output);
      return reply.send({ success: true, data: task });
    },
  );

  /**
   * POST /agent-ops/agents/:uuid/tasks/:taskUuid/fail
   * Agent reports a task failure. The task is released for other agents.
   * Body: { error: string }
   */
  app.post(
    '/agent-ops/agents/:uuid/tasks/:taskUuid/fail',
    {
      schema: {
        ...agentTaskParamSchema,
        body: {
          type: 'object',
          required: ['error'],
          properties: {
            error: { type: 'string', minLength: 1 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid, taskUuid } = request.params as { uuid: string; taskUuid: string };
      const { error } = request.body as { error: string };
      const task = await failTask(app.db, uuid, taskUuid, error);
      return reply.send({ success: true, data: task });
    },
  );

  /**
   * POST /agent-ops/agents/:uuid/broadcast
   * Agent broadcasts a message to all team agents.
   * Body: { subject: string, content: string, metadata?: object }
   */
  app.post(
    '/agent-ops/agents/:uuid/broadcast',
    {
      schema: {
        ...agentParamSchema,
        body: {
          type: 'object',
          required: ['subject', 'content'],
          properties: {
            subject: { type: 'string', minLength: 1 },
            content: { type: 'string', minLength: 1 },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid } = request.params as { uuid: string };
      const { subject, content, metadata } = request.body as {
        subject: string; content: string; metadata?: Record<string, unknown>;
      };
      const msg = await broadcastMessage(app.db, uuid, subject, content, metadata);
      return reply.status(201).send({ success: true, data: msg });
    },
  );

  /**
   * POST /agent-ops/agents/:uuid/message
   * Agent sends a direct message to another agent.
   * Body: { toAgentUuid: string, subject: string, content: string, metadata?: object }
   */
  app.post(
    '/agent-ops/agents/:uuid/message',
    {
      schema: {
        ...agentParamSchema,
        body: {
          type: 'object',
          required: ['toAgentUuid', 'subject', 'content'],
          properties: {
            toAgentUuid: { type: 'string', format: 'uuid' },
            subject: { type: 'string', minLength: 1 },
            content: { type: 'string', minLength: 1 },
            metadata: { type: 'object' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid } = request.params as { uuid: string };
      const { toAgentUuid, subject, content, metadata } = request.body as {
        toAgentUuid: string; subject: string; content: string; metadata?: Record<string, unknown>;
      };
      const msg = await sendDirectMessage(app.db, uuid, toAgentUuid, subject, content, metadata);
      return reply.status(201).send({ success: true, data: msg });
    },
  );

  /**
   * GET /agent-ops/agents/:uuid/inbox
   * Returns unread messages for the agent.
   * Query: ?markAsRead=true&limit=20
   */
  app.get(
    '/agent-ops/agents/:uuid/inbox',
    {
      schema: {
        ...agentParamSchema,
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            markAsRead: { type: 'boolean', default: false },
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid } = request.params as { uuid: string };
      const { markAsRead, limit } = request.query as { markAsRead?: boolean; limit?: number };
      const messages = await readInbox(app.db, uuid, markAsRead, limit);
      return reply.send({ success: true, data: { messages, count: messages.length } });
    },
  );

  /**
   * POST /agent-ops/agents/:uuid/status
   * Agent reports its own status.
   * Body: { status: "online"|"degraded"|"offline", details?: string }
   */
  app.post(
    '/agent-ops/agents/:uuid/status',
    {
      schema: {
        ...agentParamSchema,
        body: {
          type: 'object',
          required: ['status'],
          properties: {
            status: { type: 'string', enum: ['online', 'degraded', 'offline'] },
            details: { type: 'string' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid } = request.params as { uuid: string };
      const { status, details } = request.body as { status: 'online' | 'degraded' | 'offline'; details?: string };
      const result = await reportStatus(app.db, uuid, status, details);
      return reply.send({ success: true, data: result });
    },
  );

  // ── Phase 9: Agent Task Delegation ────────────────────────────────────

  /**
   * POST /agent-ops/agents/:uuid/delegate
   * Agent creates a subtask for another agent (A2A delegation).
   * The subtask is tagged with the required capability for auto-matching.
   */
  app.post(
    '/agent-ops/agents/:uuid/delegate',
    {
      schema: {
        ...agentParamSchema,
        body: {
          type: 'object',
          required: ['title', 'capability'],
          properties: {
            title: { type: 'string', minLength: 1, maxLength: 500 },
            description: { type: 'string', maxLength: 4096 },
            capability: { type: 'string', minLength: 1 },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
            dependsOn: { type: 'array', items: { type: 'string', format: 'uuid' }, default: [] },
            inputMapping: { type: 'object' },
            outputSchema: { type: 'object' },
            maxRetries: { type: 'integer', minimum: 0, maximum: 10, default: 0 },
            timeoutMs: { type: 'integer', minimum: 1000 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid } = request.params as { uuid: string };
      const body = request.body as {
        title: string;
        description?: string;
        capability: string;
        priority?: string;
        dependsOn?: string[];
        inputMapping?: Record<string, unknown>;
        outputSchema?: Record<string, unknown>;
        maxRetries?: number;
        timeoutMs?: number;
      };
      const task = await delegateTask(app.db, uuid, body);
      return reply.status(201).send({ success: true, data: task });
    },
  );

  // ── Phase 9: Agent Progress Streaming ─────────────────────────────────

  /**
   * POST /agent-ops/agents/:uuid/tasks/:taskUuid/progress
   * Agent reports progress on a task (step N/M with message).
   * Emits real-time WebSocket event for live UI updates.
   */
  app.post(
    '/agent-ops/agents/:uuid/tasks/:taskUuid/progress',
    {
      schema: {
        ...agentTaskParamSchema,
        body: {
          type: 'object',
          required: ['step', 'total'],
          properties: {
            step: { type: 'integer', minimum: 0 },
            total: { type: 'integer', minimum: 1 },
            message: { type: 'string', maxLength: 1000 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { uuid, taskUuid } = request.params as { uuid: string; taskUuid: string };
      const { step, total, message } = request.body as { step: number; total: number; message?: string };
      const result = await updateTaskProgress(app.db, uuid, taskUuid, step, total, message);
      return reply.send({ success: true, data: result });
    },
  );
}
