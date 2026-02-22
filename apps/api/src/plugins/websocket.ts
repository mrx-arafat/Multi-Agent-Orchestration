/**
 * WebSocket plugin — real-time event streaming to authenticated clients.
 *
 * Two connection modes:
 *
 * 1. USER MODE: GET /ws?token=<jwt>
 *    - Subscribes to user:<uuid> channel + team channels
 *    - For dashboards, bots, human users
 *
 * 2. AGENT MODE: GET /ws/agent?token=<jwt>&agentUuid=<uuid>
 *    - Subscribes to agent:<uuid> + team:<teamUuid> channels
 *    - Auto-marks agent as online, heartbeat every 30s
 *    - Receives task:assigned pushes for immediate execution
 *    - On disconnect, marks agent offline after grace period
 */
import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { eventBus, type RealtimeEvent, emitTeamEvent } from '../lib/event-bus.js';
import { eq, and, isNull } from 'drizzle-orm';
import { agents } from '../db/schema/index.js';

interface ConnectedClient {
  ws: WebSocket;
  userUuid: string;
  channels: Set<string>;
}

interface ConnectedAgent {
  ws: WebSocket;
  agentUuid: string;
  userUuid: string;
  teamUuid: string | null;
  channels: Set<string>;
  heartbeatTimer: ReturnType<typeof setInterval> | null;
  lastPong: number;
}

declare module 'fastify' {
  interface FastifyInstance {
    wsClients: Map<WebSocket, ConnectedClient>;
    wsAgents: Map<string, ConnectedAgent>;
  }
}

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 45_000; // If no pong in 45s, disconnect

export const websocketPlugin = fp(async function (app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  const clients = new Map<WebSocket, ConnectedClient>();
  const agentConnections = new Map<string, ConnectedAgent>();
  app.decorate('wsClients', clients);
  app.decorate('wsAgents', agentConnections);

  // Listen to the event bus and broadcast to subscribed clients + agents
  const onRealtimeEvent = (event: RealtimeEvent): void => {
    const message = JSON.stringify({ type: event.type, payload: event.payload });

    // Broadcast to user clients
    for (const client of clients.values()) {
      if (client.channels.has(event.channel) && client.ws.readyState === 1) {
        client.ws.send(message);
      }
    }

    // Broadcast to agent connections
    for (const agent of agentConnections.values()) {
      if (agent.channels.has(event.channel) && agent.ws.readyState === 1) {
        agent.ws.send(message);
      }
    }
  };

  eventBus.on(onRealtimeEvent);

  // Clean up listener on app close
  app.addHook('onClose', async () => {
    eventBus.off(onRealtimeEvent);
    for (const client of clients.values()) {
      client.ws.close(1001, 'Server shutting down');
    }
    clients.clear();
    for (const agent of agentConnections.values()) {
      if (agent.heartbeatTimer) clearInterval(agent.heartbeatTimer);
      agent.ws.close(1001, 'Server shutting down');
    }
    agentConnections.clear();
  });

  // ── User WebSocket route ────────────────────────────────────────────
  app.get('/ws', { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      socket.close(4001, 'Authentication required');
      return;
    }

    let decoded: { sub: string; email: string; role: string; type: string };
    try {
      decoded = app.jwt.verify<{ sub: string; email: string; role: string; type: string }>(token);
      if (decoded.type !== 'access') {
        socket.close(4001, 'Invalid token type');
        return;
      }
    } catch {
      socket.close(4001, 'Invalid token');
      return;
    }

    const client: ConnectedClient = {
      ws: socket,
      userUuid: decoded.sub,
      channels: new Set([`user:${decoded.sub}`]),
    };
    clients.set(socket, client);

    app.log.info({ userUuid: decoded.sub }, 'WebSocket client connected');

    socket.send(JSON.stringify({
      type: 'connected',
      payload: { userUuid: decoded.sub, message: 'Connected to MAOF real-time events' },
    }));

    socket.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as {
          action?: string;
          channels?: string[];
        };

        if (msg.action === 'subscribe' && Array.isArray(msg.channels)) {
          for (const ch of msg.channels) {
            if (typeof ch === 'string' && (ch.startsWith('team:') || ch.startsWith('user:'))) {
              client.channels.add(ch);
            }
          }
          socket.send(JSON.stringify({
            type: 'subscribed',
            payload: { channels: [...client.channels] },
          }));
        }

        if (msg.action === 'unsubscribe' && Array.isArray(msg.channels)) {
          for (const ch of msg.channels) {
            if (ch !== `user:${decoded.sub}`) {
              client.channels.delete(ch);
            }
          }
          socket.send(JSON.stringify({
            type: 'unsubscribed',
            payload: { channels: [...client.channels] },
          }));
        }

        if (msg.action === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', payload: {} }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    socket.on('close', () => {
      clients.delete(socket);
      app.log.info({ userUuid: decoded.sub }, 'WebSocket client disconnected');
    });

    socket.on('error', () => {
      clients.delete(socket);
    });
  });

  // ── Agent WebSocket route ───────────────────────────────────────────
  app.get('/ws/agent', { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    const agentUuid = url.searchParams.get('agentUuid');

    if (!token || !agentUuid) {
      socket.close(4001, 'Authentication and agentUuid required');
      return;
    }

    let decoded: { sub: string; type: string };
    try {
      decoded = app.jwt.verify<{ sub: string; type: string }>(token);
      if (decoded.type !== 'access') {
        socket.close(4001, 'Invalid token type');
        return;
      }
    } catch {
      socket.close(4001, 'Invalid token');
      return;
    }

    // Verify agent exists and mark as connected (async, fire-and-forget initial check)
    const initAgent = async (): Promise<void> => {
      const [agent] = await app.db
        .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
        .from(agents)
        .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
        .limit(1);

      if (!agent) {
        socket.close(4002, 'Agent not found');
        return;
      }

      // Close existing connection for this agent (only one active connection per agent)
      const existing = agentConnections.get(agentUuid);
      if (existing) {
        if (existing.heartbeatTimer) clearInterval(existing.heartbeatTimer);
        existing.ws.close(4003, 'Replaced by new connection');
        agentConnections.delete(agentUuid);
      }

      // Build channels
      const channels = new Set<string>([`agent:${agentUuid}`]);
      if (agent.teamUuid) {
        channels.add(`team:${agent.teamUuid}`);
      }

      const agentClient: ConnectedAgent = {
        ws: socket,
        agentUuid,
        userUuid: decoded.sub,
        teamUuid: agent.teamUuid,
        channels,
        heartbeatTimer: null,
        lastPong: Date.now(),
      };

      agentConnections.set(agentUuid, agentClient);

      // Mark agent as online + ws_connected in DB
      await app.db
        .update(agents)
        .set({
          status: 'online',
          wsConnected: true,
          lastHeartbeat: new Date(),
          lastHealthCheck: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(agents.agentUuid, agentUuid));

      app.log.info({ agentUuid, teamUuid: agent.teamUuid }, 'Agent WebSocket connected');

      // Send welcome with context
      socket.send(JSON.stringify({
        type: 'agent:connected',
        payload: {
          agentUuid,
          teamUuid: agent.teamUuid,
          channels: [...channels],
          heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
          message: 'Agent connected. Send {"action":"heartbeat"} every 30s.',
        },
      }));

      // Emit team event so dashboard sees agent come online
      if (agent.teamUuid) {
        emitTeamEvent(agent.teamUuid, 'agent:online', {
          agentUuid,
          timestamp: new Date().toISOString(),
        });
      }

      // Start heartbeat checker
      agentClient.heartbeatTimer = setInterval(() => {
        if (Date.now() - agentClient.lastPong > HEARTBEAT_TIMEOUT_MS) {
          app.log.warn({ agentUuid }, 'Agent heartbeat timeout — disconnecting');
          socket.close(4004, 'Heartbeat timeout');
          return;
        }
        // Send server-side ping
        if (socket.readyState === 1) {
          socket.send(JSON.stringify({ type: 'heartbeat:ping', payload: { ts: Date.now() } }));
        }
      }, HEARTBEAT_INTERVAL_MS);
    };

    initAgent().catch((err) => {
      app.log.error({ err, agentUuid }, 'Failed to initialize agent WebSocket');
      socket.close(4005, 'Initialization failed');
    });

    // Handle agent messages
    socket.on('message', (raw: Buffer | string) => {
      try {
        const msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString()) as {
          action?: string;
        };

        if (msg.action === 'heartbeat' || msg.action === 'pong') {
          const agentClient = agentConnections.get(agentUuid);
          if (agentClient) {
            agentClient.lastPong = Date.now();
            // Update heartbeat in DB (batched — not every single heartbeat)
            app.db
              .update(agents)
              .set({ lastHeartbeat: new Date(), updatedAt: new Date() })
              .where(eq(agents.agentUuid, agentUuid))
              .catch(() => {});
          }
          socket.send(JSON.stringify({ type: 'heartbeat:ack', payload: { ts: Date.now() } }));
        }

        if (msg.action === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', payload: {} }));
        }
      } catch {
        // Ignore malformed messages
      }
    });

    // Handle disconnect
    socket.on('close', () => {
      const agentClient = agentConnections.get(agentUuid);
      if (agentClient) {
        if (agentClient.heartbeatTimer) clearInterval(agentClient.heartbeatTimer);
        agentConnections.delete(agentUuid);

        // Mark agent as offline + ws_disconnected
        app.db
          .update(agents)
          .set({
            status: 'offline',
            wsConnected: false,
            updatedAt: new Date(),
          })
          .where(eq(agents.agentUuid, agentUuid))
          .catch(() => {});

        if (agentClient.teamUuid) {
          emitTeamEvent(agentClient.teamUuid, 'agent:offline', {
            agentUuid,
            timestamp: new Date().toISOString(),
          });
        }

        app.log.info({ agentUuid }, 'Agent WebSocket disconnected');
      }
    });

    socket.on('error', () => {
      const agentClient = agentConnections.get(agentUuid);
      if (agentClient) {
        if (agentClient.heartbeatTimer) clearInterval(agentClient.heartbeatTimer);
        agentConnections.delete(agentUuid);
      }
    });
  });
});
