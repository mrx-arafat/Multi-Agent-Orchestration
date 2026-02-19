/**
 * Redis-based concurrent task tracker for agents.
 * Uses atomic Redis operations to track how many tasks each agent is currently processing.
 *
 * Key format: maof:agent:tasks:{agentUuid}
 * Values are integers incremented/decremented atomically.
 * TTL: 1 hour (auto-cleanup for stale counters).
 */
import type { Redis } from 'ioredis';

const KEY_PREFIX = 'maof:agent:tasks:';
const KEY_TTL_SECONDS = 3600; // 1 hour

function taskKey(agentUuid: string): string {
  return `${KEY_PREFIX}${agentUuid}`;
}

/**
 * Increments the concurrent task count for an agent.
 * Returns the new count.
 */
export async function incrementAgentTasks(redis: Redis, agentUuid: string): Promise<number> {
  const key = taskKey(agentUuid);
  const count = await redis.incr(key);
  await redis.expire(key, KEY_TTL_SECONDS);
  return count;
}

/**
 * Decrements the concurrent task count for an agent.
 * Ensures count never goes below 0.
 * Returns the new count.
 */
export async function decrementAgentTasks(redis: Redis, agentUuid: string): Promise<number> {
  const key = taskKey(agentUuid);
  const count = await redis.decr(key);
  if (count < 0) {
    await redis.set(key, 0, 'EX', KEY_TTL_SECONDS);
    return 0;
  }
  await redis.expire(key, KEY_TTL_SECONDS);
  return count;
}

/**
 * Gets the current concurrent task count for an agent.
 */
export async function getAgentTaskCount(redis: Redis, agentUuid: string): Promise<number> {
  const val = await redis.get(taskKey(agentUuid));
  return val ? parseInt(val, 10) : 0;
}

/**
 * Gets concurrent task counts for multiple agents.
 * Returns a Map of agentUuid -> currentTaskCount.
 */
export async function getAgentTaskCounts(
  redis: Redis,
  agentUuids: string[],
): Promise<Map<string, number>> {
  if (agentUuids.length === 0) return new Map();

  const keys = agentUuids.map(taskKey);
  const values = await redis.mget(...keys);

  const result = new Map<string, number>();
  for (let i = 0; i < agentUuids.length; i++) {
    result.set(agentUuids[i]!, parseInt(values[i] ?? '0', 10));
  }
  return result;
}
