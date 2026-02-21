/**
 * Agent router — smart capability-based agent selection with multi-factor scoring.
 *
 * Selection strategy (SRS FR-4.2, enhanced):
 * 1. Filter: online/degraded + has capability + not deleted
 * 2. Fetch concurrent task counts from Redis
 * 3. Fetch average response times from Redis
 * 4. Score each agent: capacity (40%) + response time (30%) + health (20%) + recency (10%)
 * 5. Select highest-scoring agent that is not at capacity
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '../../db/index.js';
import { agents } from '../../db/schema/index.js';
import { getAgentTaskCounts } from './task-tracker.js';
import {
  getCachedAgentsForCapability,
  cacheAgentsForCapability,
} from '../../lib/cache.js';

export interface RoutedAgent {
  agentUuid: string;
  agentId: string;
  name: string;
  endpoint: string;
  maxConcurrentTasks: number;
}

export interface ScoredAgent extends RoutedAgent {
  score: number;
  breakdown: {
    capacityScore: number;
    responseTimeScore: number;
    healthScore: number;
    recencyScore: number;
  };
  currentTasks: number;
  avgResponseTimeMs: number;
  healthStatus: string;
}

// ── Response Time Tracking ─────────────────────────────────────────────

const RESPONSE_TIME_PREFIX = 'maof:agent:rt:';
const RESPONSE_TIME_MAX_SAMPLES = 20;

/**
 * Records an agent's response time for a capability execution.
 * Keeps a rolling window of the last 20 samples.
 */
export async function recordAgentResponseTime(
  redis: Redis,
  agentUuid: string,
  responseTimeMs: number,
): Promise<void> {
  const key = `${RESPONSE_TIME_PREFIX}${agentUuid}`;
  await redis.lpush(key, String(responseTimeMs));
  await redis.ltrim(key, 0, RESPONSE_TIME_MAX_SAMPLES - 1);
  await redis.expire(key, 7200); // 2 hour TTL
}

/**
 * Gets the average response time for an agent.
 * Returns null if no data available.
 */
export async function getAgentAvgResponseTime(
  redis: Redis,
  agentUuid: string,
): Promise<number | null> {
  const key = `${RESPONSE_TIME_PREFIX}${agentUuid}`;
  const samples = await redis.lrange(key, 0, -1);
  if (samples.length === 0) return null;
  const sum = samples.reduce((acc, s) => acc + parseInt(s, 10), 0);
  return Math.round(sum / samples.length);
}

/**
 * Gets average response times for multiple agents.
 */
async function getAgentAvgResponseTimes(
  redis: Redis,
  agentUuids: string[],
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>();
  if (agentUuids.length === 0) return result;

  const pipeline = redis.pipeline();
  for (const uuid of agentUuids) {
    pipeline.lrange(`${RESPONSE_TIME_PREFIX}${uuid}`, 0, -1);
  }
  const responses = await pipeline.exec();

  for (let i = 0; i < agentUuids.length; i++) {
    const [err, samples] = (responses?.[i] ?? [null, []]) as [Error | null, string[]];
    if (err || !samples || samples.length === 0) {
      result.set(agentUuids[i]!, null);
    } else {
      const sum = samples.reduce((acc, s) => acc + parseInt(s, 10), 0);
      result.set(agentUuids[i]!, Math.round(sum / samples.length));
    }
  }
  return result;
}

// ── Agent Health Status Lookup ────────────────────────────────────────

/** Fetches health status for candidate agents from DB */
async function getAgentHealthStatuses(
  db: Database,
  agentUuids: string[],
): Promise<Map<string, string>> {
  if (agentUuids.length === 0) return new Map();
  const rows = await db
    .select({ agentUuid: agents.agentUuid, status: agents.status })
    .from(agents)
    .where(sql`${agents.agentUuid} IN (${sql.join(agentUuids.map(u => sql`${u}`), sql`, `)})`);
  const result = new Map<string, string>();
  for (const row of rows) {
    result.set(row.agentUuid, row.status);
  }
  return result;
}

// ── Scoring Algorithm ──────────────────────────────────────────────────

const WEIGHT_CAPACITY = 0.4;
const WEIGHT_RESPONSE_TIME = 0.3;
const WEIGHT_HEALTH = 0.2;
const WEIGHT_RECENCY = 0.1;

/**
 * Scores an agent based on multiple factors.
 * Each factor is normalized to 0-100, then weighted.
 */
function scoreAgent(
  agent: RoutedAgent,
  currentTasks: number,
  avgResponseTimeMs: number | null,
  healthStatus: string,
  maxResponseTime: number,
): ScoredAgent {
  // Capacity score: % of available slots (more available = higher score)
  const available = Math.max(0, agent.maxConcurrentTasks - currentTasks);
  const capacityScore = agent.maxConcurrentTasks > 0
    ? (available / agent.maxConcurrentTasks) * 100
    : 0;

  // Response time score: faster agents score higher (inverse normalized)
  let responseTimeScore = 50; // Default for unknown
  const effectiveResponseTime = avgResponseTimeMs ?? maxResponseTime;
  if (maxResponseTime > 0) {
    responseTimeScore = Math.max(0, (1 - effectiveResponseTime / maxResponseTime) * 100);
  }

  // Health score: online=100, degraded=40, offline=0
  const healthScore = healthStatus === 'online' ? 100 : healthStatus === 'degraded' ? 40 : 0;

  // Recency score: agents with fewer current tasks get a boost (responsive availability)
  const recencyScore = currentTasks === 0 ? 100 : Math.max(0, 100 - currentTasks * 20);

  const score =
    capacityScore * WEIGHT_CAPACITY +
    responseTimeScore * WEIGHT_RESPONSE_TIME +
    healthScore * WEIGHT_HEALTH +
    recencyScore * WEIGHT_RECENCY;

  return {
    ...agent,
    score: Math.round(score * 100) / 100,
    breakdown: {
      capacityScore: Math.round(capacityScore * 100) / 100,
      responseTimeScore: Math.round(responseTimeScore * 100) / 100,
      healthScore,
      recencyScore: Math.round(recencyScore * 100) / 100,
    },
    currentTasks,
    avgResponseTimeMs: effectiveResponseTime,
    healthStatus,
  };
}

// ── Query & Selection ─────────────────────────────────────────────────

/** Queries the DB for online/degraded agents with a given capability. */
async function queryAgentCandidates(
  db: Database,
  capability: string,
  excludeAgentUuids: string[],
): Promise<RoutedAgent[]> {
  const conditions = [
    isNull(agents.deletedAt),
    sql`${agents.status} IN ('online', 'degraded')`,
    sql`${agents.capabilities} @> ARRAY[${capability}]::text[]`,
  ];

  if (excludeAgentUuids.length > 0) {
    for (const uuid of excludeAgentUuids) {
      conditions.push(sql`${agents.agentUuid} != ${uuid}`);
    }
  }

  return db
    .select({
      agentUuid: agents.agentUuid,
      agentId: agents.agentId,
      name: agents.name,
      endpoint: agents.endpoint,
      maxConcurrentTasks: agents.maxConcurrentTasks,
    })
    .from(agents)
    .where(and(...conditions))
    .orderBy(sql`${agents.maxConcurrentTasks} DESC`);
}

/**
 * Finds the best available agent matching the required capability.
 * Uses multi-factor scoring: capacity, response time, health, recency.
 *
 * Returns null if no agent is available (all offline, at capacity, or excluded).
 */
export async function findAgentForCapability(
  db: Database,
  capability: string,
  excludeAgentUuids: string[] = [],
  redis?: Redis,
): Promise<RoutedAgent | null> {
  // Try Redis capability cache first (reduce DB load)
  let candidates: RoutedAgent[];

  if (redis && excludeAgentUuids.length === 0) {
    const cached = await getCachedAgentsForCapability(redis, capability).catch(() => null);
    if (cached && cached.length > 0) {
      candidates = cached;
    } else {
      candidates = await queryAgentCandidates(db, capability, excludeAgentUuids);
      if (candidates.length > 0) {
        await cacheAgentsForCapability(redis, capability, candidates).catch(() => {});
      }
    }
  } else {
    candidates = await queryAgentCandidates(db, capability, excludeAgentUuids);
  }

  if (candidates.length === 0) return null;

  // Without Redis, fall back to static capacity ordering (first match)
  if (!redis) return candidates[0]!;

  const scored = await scoreAgentCandidates(db, redis, candidates);
  // Select the highest-scoring agent that has capacity
  const best = scored.find(a => a.currentTasks < a.maxConcurrentTasks) ?? null;
  return best;
}

/**
 * Scores all candidate agents and returns them sorted by score (descending).
 * Exposed for the capability-matching API endpoint.
 */
export async function scoreAgentCandidates(
  db: Database,
  redis: Redis,
  candidates: RoutedAgent[],
): Promise<ScoredAgent[]> {
  const uuids = candidates.map(a => a.agentUuid);

  // Fetch all scoring data in parallel
  const [taskCounts, responseTimes, healthStatuses] = await Promise.all([
    getAgentTaskCounts(redis, uuids),
    getAgentAvgResponseTimes(redis, uuids),
    getAgentHealthStatuses(db, uuids),
  ]);

  // Find max response time for normalization
  let maxResponseTime = 0;
  for (const rt of responseTimes.values()) {
    if (rt !== null && rt > maxResponseTime) maxResponseTime = rt;
  }
  if (maxResponseTime === 0) maxResponseTime = 5000; // Default 5s ceiling

  const scored = candidates.map(agent =>
    scoreAgent(
      agent,
      taskCounts.get(agent.agentUuid) ?? 0,
      responseTimes.get(agent.agentUuid) ?? null,
      healthStatuses.get(agent.agentUuid) ?? 'offline',
      maxResponseTime,
    ),
  );

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Returns all matching agents for a capability with their scores.
 * Used by the capability-matching API endpoint.
 */
export async function matchAgentsForCapability(
  db: Database,
  capability: string,
  redis?: Redis,
): Promise<{ capability: string; agents: ScoredAgent[]; bestAgent: ScoredAgent | null }> {
  const candidates = await queryAgentCandidates(db, capability, []);

  if (candidates.length === 0 || !redis) {
    return {
      capability,
      agents: candidates.map(a => ({
        ...a,
        score: 50,
        breakdown: { capacityScore: 50, responseTimeScore: 50, healthScore: 100, recencyScore: 100 },
        currentTasks: 0,
        avgResponseTimeMs: 0,
        healthStatus: 'online',
      })),
      bestAgent: candidates.length > 0 ? {
        ...candidates[0]!,
        score: 50,
        breakdown: { capacityScore: 50, responseTimeScore: 50, healthScore: 100, recencyScore: 100 },
        currentTasks: 0,
        avgResponseTimeMs: 0,
        healthStatus: 'online',
      } : null,
    };
  }

  const scored = await scoreAgentCandidates(db, redis, candidates);
  const bestAgent = scored.find(a => a.currentTasks < a.maxConcurrentTasks) ?? null;

  return { capability, agents: scored, bestAgent };
}
