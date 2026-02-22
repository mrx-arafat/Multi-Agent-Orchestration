/**
 * Redis-backed per-agent event buffer for SSE/long-poll delivery.
 *
 * Key patterns:
 *   maof:agent:events:{agentUuid}        — List of serialised events (FIFO)
 *   maof:agent:events:seq:{agentUuid}    — Auto-increment sequence counter
 *
 * Each event is stored as a JSON string with a monotonic `id` field
 * so that SSE clients can resume via Last-Event-ID.
 */
import type { Redis } from 'ioredis';

const BUFFER_PREFIX = 'maof:agent:events:';
const SEQ_PREFIX = 'maof:agent:events:seq:';
const MAX_BUFFER_SIZE = 1000;
const BUFFER_TTL_SECONDS = 86_400; // 24 hours

export interface BufferedEvent {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

/**
 * Push an event into an agent's Redis buffer.
 * Assigns a monotonic sequence ID, trims to MAX_BUFFER_SIZE, and refreshes TTL.
 */
export async function pushEvent(
  redis: Redis,
  agentUuid: string,
  event: { type: string; payload: Record<string, unknown> },
): Promise<BufferedEvent> {
  const seqKey = `${SEQ_PREFIX}${agentUuid}`;
  const bufKey = `${BUFFER_PREFIX}${agentUuid}`;

  const id = await redis.incr(seqKey);

  const buffered: BufferedEvent = {
    id,
    type: event.type,
    payload: event.payload,
    timestamp: new Date().toISOString(),
  };

  const pipeline = redis.pipeline();
  pipeline.rpush(bufKey, JSON.stringify(buffered));
  pipeline.ltrim(bufKey, -MAX_BUFFER_SIZE, -1);
  pipeline.expire(bufKey, BUFFER_TTL_SECONDS);
  pipeline.expire(seqKey, BUFFER_TTL_SECONDS);
  await pipeline.exec();

  return buffered;
}

/**
 * Atomically drain all events from an agent's buffer.
 * Uses a Lua script to LRANGE + DEL in one round-trip.
 */
const DRAIN_LUA = `
  local events = redis.call('LRANGE', KEYS[1], 0, -1)
  if #events > 0 then
    redis.call('DEL', KEYS[1])
  end
  return events
`;

export async function drainEvents(
  redis: Redis,
  agentUuid: string,
): Promise<BufferedEvent[]> {
  const bufKey = `${BUFFER_PREFIX}${agentUuid}`;
  const raw = (await redis.eval(DRAIN_LUA, 1, bufKey)) as string[];

  if (!raw || raw.length === 0) return [];

  return raw.map((s) => JSON.parse(s) as BufferedEvent);
}

/**
 * Peek at events without deleting them (for SSE reconnect via Last-Event-ID).
 * If `afterId` is provided, only returns events with id > afterId.
 */
export async function peekEvents(
  redis: Redis,
  agentUuid: string,
  afterId?: number,
): Promise<BufferedEvent[]> {
  const bufKey = `${BUFFER_PREFIX}${agentUuid}`;
  const raw = await redis.lrange(bufKey, 0, -1);

  if (!raw || raw.length === 0) return [];

  const events = raw.map((s) => JSON.parse(s) as BufferedEvent);

  if (afterId !== undefined) {
    return events.filter((e) => e.id > afterId);
  }

  return events;
}
