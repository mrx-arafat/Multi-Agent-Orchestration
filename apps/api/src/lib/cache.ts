/**
 * Redis caching layer for stage outputs and agent capability lookups.
 * SRS Phase 2: Sub-50ms context lookups for stage outputs.
 *
 * Key patterns:
 *   maof:cache:stage:{runId}:{stageId}   — cached stage output
 *   maof:cache:agents:cap:{capability}    — cached agent list for capability
 */
import type { Redis } from 'ioredis';

const STAGE_CACHE_PREFIX = 'maof:cache:stage:';
const AGENT_CAP_CACHE_PREFIX = 'maof:cache:agents:cap:';

/** Stage output cache TTL: 1 hour (outputs are immutable once written). */
const STAGE_CACHE_TTL = 3600;
/** Agent capability cache TTL: 30 seconds (agents can go offline). */
const AGENT_CAP_CACHE_TTL = 30;

// ── Stage Output Cache ──────────────────────────────────────────────────

/**
 * Caches a stage's output in Redis for fast retrieval during variable interpolation.
 */
export async function cacheStageOutput(
  redis: Redis,
  workflowRunId: string,
  stageId: string,
  output: unknown,
): Promise<void> {
  const key = `${STAGE_CACHE_PREFIX}${workflowRunId}:${stageId}`;
  await redis.set(key, JSON.stringify(output), 'EX', STAGE_CACHE_TTL);
}

/**
 * Retrieves a cached stage output. Returns null on cache miss.
 */
export async function getCachedStageOutput(
  redis: Redis,
  workflowRunId: string,
  stageId: string,
): Promise<unknown | null> {
  const key = `${STAGE_CACHE_PREFIX}${workflowRunId}:${stageId}`;
  const raw = await redis.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Invalidates all cached stage outputs for a workflow run.
 */
export async function invalidateWorkflowCache(
  redis: Redis,
  workflowRunId: string,
): Promise<void> {
  const pattern = `${STAGE_CACHE_PREFIX}${workflowRunId}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

// ── Agent Capability Cache ──────────────────────────────────────────────

export interface CachedAgent {
  agentUuid: string;
  agentId: string;
  name: string;
  endpoint: string;
  maxConcurrentTasks: number;
}

/**
 * Caches the list of online agents for a capability.
 */
export async function cacheAgentsForCapability(
  redis: Redis,
  capability: string,
  agents: CachedAgent[],
): Promise<void> {
  const key = `${AGENT_CAP_CACHE_PREFIX}${capability}`;
  await redis.set(key, JSON.stringify(agents), 'EX', AGENT_CAP_CACHE_TTL);
}

/**
 * Retrieves cached agents for a capability. Returns null on cache miss.
 */
export async function getCachedAgentsForCapability(
  redis: Redis,
  capability: string,
): Promise<CachedAgent[] | null> {
  const key = `${AGENT_CAP_CACHE_PREFIX}${capability}`;
  const raw = await redis.get(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as CachedAgent[];
  } catch {
    return null;
  }
}

/**
 * Invalidates all agent capability caches (e.g., when agent status changes).
 */
export async function invalidateAgentCapabilityCache(redis: Redis): Promise<void> {
  const pattern = `${AGENT_CAP_CACHE_PREFIX}*`;
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
