/**
 * WebSocket plugin — real-time event streaming to authenticated clients.
 *
 * Clients connect to GET /ws?token=<jwt> and receive JSON events:
 *   { type: "task:created", payload: { ... } }
 *
 * After connecting, clients send a JSON "subscribe" message to join channels:
 *   { action: "subscribe", channels: ["team:<uuid>", "team:<uuid2>"] }
 *   { action: "unsubscribe", channels: ["team:<uuid>"] }
 *
 * The server automatically subscribes the user to "user:<userUuid>".
 */
import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { eventBus, type RealtimeEvent } from '../lib/event-bus.js';

interface ConnectedClient {
  ws: WebSocket;
  userUuid: string;
  channels: Set<string>;
}

declare module 'fastify' {
  interface FastifyInstance {
    wsClients: Map<WebSocket, ConnectedClient>;
  }
}

export const websocketPlugin = fp(async function (app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  const clients = new Map<WebSocket, ConnectedClient>();
  app.decorate('wsClients', clients);

  // Listen to the event bus and broadcast to subscribed clients
  const onRealtimeEvent = (event: RealtimeEvent): void => {
    const message = JSON.stringify({ type: event.type, payload: event.payload });

    for (const client of clients.values()) {
      if (client.channels.has(event.channel) && client.ws.readyState === 1) {
        client.ws.send(message);
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
  });

  // WebSocket route
  app.get('/ws', { websocket: true }, (socket: WebSocket, request: FastifyRequest) => {
    // Authenticate via query string token
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

    // Register client
    const client: ConnectedClient = {
      ws: socket,
      userUuid: decoded.sub,
      channels: new Set([`user:${decoded.sub}`]),
    };
    clients.set(socket, client);

    app.log.info({ userUuid: decoded.sub }, 'WebSocket client connected');

    // Send welcome event
    socket.send(JSON.stringify({
      type: 'connected',
      payload: { userUuid: decoded.sub, message: 'Connected to MAOF real-time events' },
    }));

    // Handle incoming messages (subscribe/unsubscribe)
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
            // Never unsubscribe from own user channel
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
});
