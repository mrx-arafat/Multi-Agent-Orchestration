/**
 * Event stream — SSE and long-poll delivery for agents.
 *
 * Listens to the in-process event bus, buffers events in Redis for
 * subscribed agents, and delivers them via SSE or long-poll.
 *
 * Lifecycle:
 *   SSE  — opens stream, marks online, receives events, 45s grace on disconnect
 *   Poll — first poll marks online, blocks up to 30s, returns events, 90s offline threshold
 *   One active connection per agent (latest wins, matching WS plugin behaviour)
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and, isNull } from 'drizzle-orm';
import { agents } from '../../db/schema/index.js';
import { eventBus, type RealtimeEvent, emitTeamEvent } from '../../lib/event-bus.js';
import { pushEvent, drainEvents, peekEvents, type BufferedEvent } from './event-buffer.js';

// ── Types ────────────────────────────────────────────────────────────────

interface AgentSubscription {
  agentUuid: string;
  teamUuid: string | null;
  mode: 'sse' | 'poll';
  lastActivity: number;
  /** For SSE: the raw reply object (kept open). */
  sseReply?: FastifyReply | undefined;
  /** For long-poll: resolve function of the pending poll promise. */
  pollResolve?: ((events: BufferedEvent[]) => void) | undefined;
  /** Timeout handle for the pending long-poll. */
  pollTimer?: ReturnType<typeof setTimeout> | undefined;
  /** Grace timer after SSE disconnect before marking offline. */
  graceTimer?: ReturnType<typeof setTimeout> | undefined;
}

const SSE_GRACE_MS = 45_000;
const POLL_OFFLINE_MS = 90_000;
const CLEANUP_INTERVAL_MS = 60_000;

// ── Module state ─────────────────────────────────────────────────────────

const subscriptions = new Map<string, AgentSubscription>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let listenerRegistered = false;

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Called once during route registration. Starts the event bus listener
 * and the periodic cleanup timer.
 */
export function registerAgentEventListener(app: FastifyInstance): void {
  if (listenerRegistered) return;
  listenerRegistered = true;

  // Event bus → Redis buffer + immediate delivery
  const onEvent = (event: RealtimeEvent): void => {
    routeEventToSubscribers(app, event).catch((err) => {
      app.log.error({ err }, 'event-stream: failed to route event');
    });
  };
  eventBus.on(onEvent);

  // Periodic cleanup: mark agents offline if no activity
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [uuid, sub] of subscriptions) {
      const threshold = sub.mode === 'poll' ? POLL_OFFLINE_MS : SSE_GRACE_MS;
      if (now - sub.lastActivity > threshold) {
        markAgentOffline(app, uuid, sub.teamUuid);
        subscriptions.delete(uuid);
      }
    }
  }, CLEANUP_INTERVAL_MS);

  app.addHook('onClose', async () => {
    eventBus.off(onEvent);
    if (cleanupTimer) clearInterval(cleanupTimer);
    // Resolve any pending long-polls
    for (const sub of subscriptions.values()) {
      if (sub.pollResolve) sub.pollResolve([]);
      if (sub.pollTimer) clearTimeout(sub.pollTimer);
      if (sub.graceTimer) clearTimeout(sub.graceTimer);
    }
    subscriptions.clear();
    listenerRegistered = false;
  });
}

/**
 * SSE stream handler.
 * Streams events as `text/event-stream` until the client disconnects.
 */
export async function handleSSEStream(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  agentUuid: string,
  lastEventId?: number,
): Promise<void> {
  const sub = await ensureSubscription(app, agentUuid, 'sse');
  if (!sub) {
    return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
  }

  // Close previous SSE connection for this agent (latest wins)
  if (sub.sseReply) {
    try { sub.sseReply.raw.end(); } catch { /* already closed */ }
  }
  // Cancel any pending long-poll
  resolvePendingPoll(sub, []);

  sub.mode = 'sse';
  sub.sseReply = reply;
  sub.lastActivity = Date.now();
  if (sub.graceTimer) {
    clearTimeout(sub.graceTimer);
    sub.graceTimer = undefined;
  }

  // SSE headers
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Replay missed events on reconnect
  if (lastEventId !== undefined) {
    const missed = await peekEvents(app.redis, agentUuid, lastEventId);
    for (const event of missed) {
      writeSSE(reply, event);
    }
  }

  // Send keepalive comment immediately so clients know the stream is alive
  reply.raw.write(':ok\n\n');

  // Handle client disconnect
  request.raw.on('close', () => {
    sub.sseReply = undefined;
    // Start grace timer — if no reconnect, mark offline
    sub.graceTimer = setTimeout(() => {
      if (!sub.sseReply && sub.mode === 'sse') {
        markAgentOffline(app, agentUuid, sub.teamUuid);
        subscriptions.delete(agentUuid);
      }
    }, SSE_GRACE_MS);
  });
}

/**
 * Long-poll handler.
 * Blocks up to `timeout` ms, returns immediately if events are buffered.
 */
export async function handleLongPoll(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  agentUuid: string,
  timeout: number,
  lastEventId?: number,
): Promise<void> {
  const sub = await ensureSubscription(app, agentUuid, 'poll');
  if (!sub) {
    return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Agent not found' } });
  }

  // Cancel any previous pending poll (latest wins)
  resolvePendingPoll(sub, []);
  // Close any previous SSE stream
  if (sub.sseReply) {
    try { sub.sseReply.raw.end(); } catch { /* already closed */ }
    sub.sseReply = undefined;
  }

  sub.mode = 'poll';
  sub.lastActivity = Date.now();

  // Check for buffered events first
  const buffered = await drainEvents(app.redis, agentUuid);
  const events = lastEventId !== undefined
    ? buffered.filter((e) => e.id > lastEventId)
    : buffered;

  if (events.length > 0) {
    return reply.send({ success: true, data: { events, count: events.length } });
  }

  // No events — block until timeout or new event arrives
  const events$ = new Promise<BufferedEvent[]>((resolve) => {
    sub.pollResolve = resolve;
    sub.pollTimer = setTimeout(() => {
      sub.pollResolve = undefined;
      sub.pollTimer = undefined;
      resolve([]);
    }, timeout);
  });

  // Handle client disconnect while waiting
  request.raw.on('close', () => {
    resolvePendingPoll(sub, []);
  });

  const result = await events$;
  return reply.send({ success: true, data: { events: result, count: result.length } });
}

// ── Internal helpers ─────────────────────────────────────────────────────

async function routeEventToSubscribers(
  app: FastifyInstance,
  event: RealtimeEvent,
): Promise<void> {
  // Direct agent channel: agent:{uuid}
  if (event.channel.startsWith('agent:')) {
    const agentUuid = event.channel.slice(6);
    await deliverToAgent(app, agentUuid, event);
    return;
  }

  // Team channel: team:{uuid} — deliver to all subscribed agents in that team
  if (event.channel.startsWith('team:')) {
    const teamUuid = event.channel.slice(5);
    for (const [agentUuid, sub] of subscriptions) {
      if (sub.teamUuid === teamUuid) {
        // Skip agent:online/offline events for the agent itself
        if (
          (event.type === 'agent:online' || event.type === 'agent:offline') &&
          (event.payload as Record<string, unknown>).agentUuid === agentUuid
        ) {
          continue;
        }
        await deliverToAgent(app, agentUuid, event);
      }
    }
  }
}

async function deliverToAgent(
  app: FastifyInstance,
  agentUuid: string,
  event: RealtimeEvent,
): Promise<void> {
  const sub = subscriptions.get(agentUuid);
  if (!sub) return;

  const buffered = await pushEvent(app.redis, agentUuid, {
    type: event.type,
    payload: event.payload,
  });

  // SSE: write immediately
  if (sub.mode === 'sse' && sub.sseReply) {
    writeSSE(sub.sseReply, buffered);
    return;
  }

  // Long-poll: resolve pending promise with this event + any other buffered
  if (sub.mode === 'poll' && sub.pollResolve) {
    const all = await drainEvents(app.redis, agentUuid);
    resolvePendingPoll(sub, all.length > 0 ? all : [buffered]);
  }
}

function writeSSE(reply: FastifyReply, event: BufferedEvent): void {
  try {
    reply.raw.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`);
  } catch {
    // Client disconnected
  }
}

function resolvePendingPoll(sub: AgentSubscription, events: BufferedEvent[]): void {
  if (sub.pollResolve) {
    sub.pollResolve(events);
    sub.pollResolve = undefined;
  }
  if (sub.pollTimer) {
    clearTimeout(sub.pollTimer);
    sub.pollTimer = undefined;
  }
}

/**
 * Ensures a subscription exists for the agent, creating one if needed.
 * On first subscription, marks the agent as online.
 */
async function ensureSubscription(
  app: FastifyInstance,
  agentUuid: string,
  mode: 'sse' | 'poll',
): Promise<AgentSubscription | null> {
  const existing = subscriptions.get(agentUuid);
  if (existing) {
    existing.lastActivity = Date.now();
    return existing;
  }

  // Verify agent exists and get team info
  const [agent] = await app.db
    .select({ agentUuid: agents.agentUuid, teamUuid: agents.teamUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) return null;

  const sub: AgentSubscription = {
    agentUuid,
    teamUuid: agent.teamUuid,
    mode,
    lastActivity: Date.now(),
  };
  subscriptions.set(agentUuid, sub);

  // Mark agent as online
  await app.db
    .update(agents)
    .set({ status: 'online', lastHealthCheck: new Date(), updatedAt: new Date() })
    .where(eq(agents.agentUuid, agentUuid));

  if (agent.teamUuid) {
    emitTeamEvent(agent.teamUuid, 'agent:online', {
      agentUuid,
      connectionMode: mode,
      timestamp: new Date().toISOString(),
    });
  }

  return sub;
}

function markAgentOffline(
  app: FastifyInstance,
  agentUuid: string,
  teamUuid: string | null,
): void {
  app.db
    .update(agents)
    .set({ status: 'offline', updatedAt: new Date() })
    .where(eq(agents.agentUuid, agentUuid))
    .catch(() => {});

  if (teamUuid) {
    emitTeamEvent(teamUuid, 'agent:offline', {
      agentUuid,
      timestamp: new Date().toISOString(),
    });
  }
}
