/**
 * A2A Protocol routes — Google Agent-to-Agent interoperability.
 *
 * GET  /.well-known/agent.json           — Platform Agent Card (public)
 * GET  /a2a/agents/:uuid/agent.json      — Per-agent Agent Card (public)
 * POST /a2a                              — JSON-RPC 2.0 endpoint (authenticated)
 * GET  /a2a/tasks/:taskUuid/subscribe    — SSE stream for task updates
 */
import type { FastifyInstance } from 'fastify';
import { buildPlatformAgentCard, buildAgentCard } from './agent-card.js';
import { getActiveAgents, handleJsonRpc } from './service.js';
import type { JsonRpcRequest } from './service.js';
import { eq, isNull, and } from 'drizzle-orm';
import { agents, kanbanTasks } from '../../db/schema/index.js';
import { eventBus } from '../../lib/event-bus.js';

export async function a2aRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /.well-known/agent.json
   * Public discovery endpoint — returns the platform-wide Agent Card.
   */
  app.get('/.well-known/agent.json', async (request, reply) => {
    const baseUrl = `${request.protocol}://${request.hostname}`;
    const agentList = await getActiveAgents(app.db);
    const card = buildPlatformAgentCard(baseUrl, agentList);
    return reply.header('content-type', 'application/json').send(card);
  });

  /**
   * GET /a2a/agents/:uuid/agent.json
   * Per-agent Agent Card discovery.
   */
  app.get(
    '/a2a/agents/:uuid/agent.json',
    {
      schema: {
        params: {
          type: 'object',
          required: ['uuid'],
          properties: { uuid: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const { uuid } = request.params as { uuid: string };
      const [agent] = await app.db
        .select({
          agentUuid: agents.agentUuid,
          agentId: agents.agentId,
          name: agents.name,
          description: agents.description,
          capabilities: agents.capabilities,
          status: agents.status,
        })
        .from(agents)
        .where(and(eq(agents.agentUuid, uuid), isNull(agents.deletedAt)))
        .limit(1);

      if (!agent) {
        return reply.status(404).send({ error: 'Agent not found' });
      }

      const baseUrl = `${request.protocol}://${request.hostname}`;
      const card = buildAgentCard(baseUrl, agent);
      return reply.header('content-type', 'application/json').send(card);
    },
  );

  /**
   * POST /a2a
   * JSON-RPC 2.0 endpoint — the single entry point for A2A communication.
   */
  app.post(
    '/a2a',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body || body.jsonrpc !== '2.0' || !body.method) {
        return reply.status(400).send({
          jsonrpc: '2.0',
          id: (body?.id as string | number) ?? null,
          error: { code: -32600, message: 'Invalid JSON-RPC 2.0 request' },
        });
      }

      const rpcRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: body.id as string | number,
        method: body.method as string,
        params: body.params as Record<string, unknown> | undefined,
      };

      const response = await handleJsonRpc(app.db, rpcRequest);
      return reply.send(response);
    },
  );

  /**
   * GET /a2a/tasks/:taskUuid/subscribe
   * SSE stream for real-time task state updates.
   */
  app.get(
    '/a2a/tasks/:taskUuid/subscribe',
    {
      schema: {
        params: {
          type: 'object',
          required: ['taskUuid'],
          properties: { taskUuid: { type: 'string', format: 'uuid' } },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { taskUuid } = request.params as { taskUuid: string };

      // Verify task exists
      const [task] = await app.db
        .select({ teamUuid: kanbanTasks.teamUuid, status: kanbanTasks.status })
        .from(kanbanTasks)
        .where(eq(kanbanTasks.taskUuid, taskUuid))
        .limit(1);

      if (!task) {
        return reply.status(404).send({ error: 'Task not found' });
      }

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });

      // Send initial state
      const initialEvent = JSON.stringify({
        taskId: taskUuid,
        state: task.status,
        timestamp: new Date().toISOString(),
      });
      reply.raw.write(`event: task:state\ndata: ${initialEvent}\n\n`);

      // Subscribe to events for this task's team
      const listener = (event: { channel: string; type: string; payload: Record<string, unknown> }) => {
        if (event.channel !== `team:${task.teamUuid}`) return;

        const payload = event.payload;
        if (payload.taskUuid !== taskUuid) return;

        // Forward task-related events
        if (event.type.startsWith('task:')) {
          const sseData = JSON.stringify({
            taskId: taskUuid,
            eventType: event.type,
            ...payload,
            timestamp: new Date().toISOString(),
          });
          reply.raw.write(`event: ${event.type}\ndata: ${sseData}\n\n`);

          // Close stream when task is completed or canceled
          if (event.type === 'task:updated' && (payload.status === 'done')) {
            reply.raw.write(`event: task:complete\ndata: ${JSON.stringify({ taskId: taskUuid })}\n\n`);
            reply.raw.end();
            eventBus.off(listener);
          }
        }
      };

      eventBus.on(listener);

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        reply.raw.write(`:heartbeat\n\n`);
      }, 30_000);

      // Cleanup on disconnect
      request.raw.on('close', () => {
        clearInterval(heartbeat);
        eventBus.off(listener);
      });
    },
  );
}
