/**
 * Workflow memory store service.
 * Redis-backed key-value store scoped to workflow runs (SRS FR-3.3).
 *
 * Agents can persist intermediate data (e.g., expensive computation results)
 * and read it from subsequent stages or re-runs.
 *
 * Key format: maof:memory:{workflowRunId}:{key}
 * Default TTL: 24 hours (configurable per write).
 */
import type { Redis } from 'ioredis';

const KEY_PREFIX = 'maof:memory:';
const DEFAULT_TTL_SECONDS = 86400; // 24 hours
const MAX_TTL_SECONDS = 604800; // 7 days

function memoryKey(workflowRunId: string, key: string): string {
  return `${KEY_PREFIX}${workflowRunId}:${key}`;
}

export interface MemoryWriteParams {
  workflowRunId: string;
  key: string;
  value: unknown;
  ttlSeconds?: number;
}

/**
 * Writes a key-value pair to the workflow memory store.
 * Value is JSON-serialized.
 */
export async function writeMemory(redis: Redis, params: MemoryWriteParams): Promise<void> {
  const ttl = Math.min(params.ttlSeconds ?? DEFAULT_TTL_SECONDS, MAX_TTL_SECONDS);
  const redisKey = memoryKey(params.workflowRunId, params.key);
  const serialized = JSON.stringify(params.value);

  await redis.set(redisKey, serialized, 'EX', ttl);
}

/**
 * Reads a value from the workflow memory store.
 * Returns null if key does not exist or has expired.
 */
export async function readMemory(redis: Redis, workflowRunId: string, key: string): Promise<unknown | null> {
  const redisKey = memoryKey(workflowRunId, key);
  const raw = await redis.get(redisKey);

  if (raw === null) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return raw; // Return as string if not valid JSON
  }
}

/**
 * Deletes a key from the workflow memory store.
 */
export async function deleteMemory(redis: Redis, workflowRunId: string, key: string): Promise<boolean> {
  const redisKey = memoryKey(workflowRunId, key);
  const deleted = await redis.del(redisKey);
  return deleted > 0;
}

/**
 * Lists all keys in the workflow memory store for a given workflow run.
 */
export async function listMemoryKeys(redis: Redis, workflowRunId: string): Promise<string[]> {
  const pattern = `${KEY_PREFIX}${workflowRunId}:*`;
  const keys = await redis.keys(pattern);
  const prefix = `${KEY_PREFIX}${workflowRunId}:`;
  return keys.map((k) => k.slice(prefix.length));
}
