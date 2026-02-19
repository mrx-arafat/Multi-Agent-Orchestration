/**
 * Agent router — capability-based agent selection with load balancing.
 *
 * Selection strategy (SRS FR-4.2):
 * 1. Filter: online + has capability + not deleted
 * 2. Fetch concurrent task counts from Redis
 * 3. Exclude agents at capacity (current_tasks >= max_concurrent_tasks)
 * 4. Select agent with most available capacity (max_concurrent_tasks - current_tasks)
 */
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '../../db/index.js';
import { agents } from '../../db/schema/index.js';
import { getAgentTaskCounts } from './task-tracker.js';

export interface RoutedAgent {
  agentUuid: string;
  agentId: string;
  name: string;
  endpoint: string;
  maxConcurrentTasks: number;
}

/**
 * Finds the best available agent matching the required capability.
 * Uses Redis-backed load balancing when a Redis instance is provided.
 * Falls back to capacity-based ordering when Redis is unavailable.
 *
 * Returns null if no agent is available (all offline, at capacity, or excluded).
 */
export async function findAgentForCapability(
  db: Database,
  capability: string,
  excludeAgentUuids: string[] = [],
  redis?: Redis,
): Promise<RoutedAgent | null> {
  const conditions = [
    isNull(agents.deletedAt),
    eq(agents.status, 'online'),
    sql`${agents.capabilities} @> ARRAY[${capability}]::text[]`,
  ];

  // Exclude agents that already failed for this stage (fallback support)
  if (excludeAgentUuids.length > 0) {
    for (const uuid of excludeAgentUuids) {
      conditions.push(sql`${agents.agentUuid} != ${uuid}`);
    }
  }

  const candidates = await db
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

  if (candidates.length === 0) return null;

  // Without Redis, fall back to static capacity ordering (first match)
  if (!redis) return candidates[0]!;

  // Load-aware selection: fetch current task counts from Redis
  const taskCounts = await getAgentTaskCounts(
    redis,
    candidates.map((a) => a.agentUuid),
  );

  // Filter out agents at capacity and rank by available slots
  let bestAgent: RoutedAgent | null = null;
  let bestAvailable = -1;

  for (const agent of candidates) {
    const currentTasks = taskCounts.get(agent.agentUuid) ?? 0;
    const available = agent.maxConcurrentTasks - currentTasks;

    if (available > 0 && available > bestAvailable) {
      bestAvailable = available;
      bestAgent = agent;
    }
  }

  // If all agents are at capacity, return null (SRS: "Queue task if all agents at capacity")
  return bestAgent;
}
