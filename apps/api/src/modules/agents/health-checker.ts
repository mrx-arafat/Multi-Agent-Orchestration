/**
 * Agent health checker.
 * Calls GET {agent.endpoint}/health and updates the agent's status.
 *
 * Per SRS FR-1.3:
 * - Health endpoint: GET /health
 * - Expected response: { status: "healthy", timestamp: <unix_ms> }
 * - Marks agents as online/degraded/offline based on response
 */
import { eq, and, isNull } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import type { Database } from '../../db/index.js';
import { agents } from '../../db/schema/index.js';
import { invalidateAgentCapabilityCache } from '../../lib/cache.js';

export type AgentHealthStatus = 'online' | 'degraded' | 'offline';

export interface HealthCheckResult {
  agentUuid: string;
  agentId: string;
  previousStatus: string;
  newStatus: AgentHealthStatus;
  responseTimeMs: number;
  error?: string;
}

/**
 * Checks health of a single agent by calling GET {endpoint}/health.
 * Updates the agent's status and lastHealthCheck in the database.
 */
export async function checkAgentHealth(
  db: Database,
  agentUuid: string,
  timeoutMs = 10000,
): Promise<HealthCheckResult> {
  const [agent] = await db
    .select({
      agentUuid: agents.agentUuid,
      agentId: agents.agentId,
      endpoint: agents.endpoint,
      status: agents.status,
    })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) {
    throw new Error(`Agent '${agentUuid}' not found`);
  }

  const previousStatus = agent.status;
  const start = Date.now();
  let newStatus: AgentHealthStatus;
  let error: string | undefined;

  try {
    const url = `${agent.endpoint.replace(/\/+$/, '')}/health`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      const responseTimeMs = Date.now() - start;

      if (response.ok) {
        const body = await response.json() as { status?: string };
        if (body.status === 'healthy') {
          newStatus = 'online';
        } else {
          newStatus = 'degraded';
          error = `Agent reported status: ${body.status ?? 'unknown'}`;
        }
      } else {
        newStatus = 'degraded';
        error = `Health endpoint returned HTTP ${response.status}`;
      }

      // Update DB
      await db
        .update(agents)
        .set({ status: newStatus, lastHealthCheck: new Date(), updatedAt: new Date() })
        .where(eq(agents.agentUuid, agentUuid));

      const result: HealthCheckResult = { agentUuid, agentId: agent.agentId, previousStatus, newStatus, responseTimeMs };
      if (error) result.error = error;
      return result;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    const responseTimeMs = Date.now() - start;
    newStatus = 'offline';

    if (err instanceof Error && err.name === 'AbortError') {
      error = `Health check timed out after ${timeoutMs}ms`;
    } else {
      error = `Failed to reach agent: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }

    await db
      .update(agents)
      .set({ status: newStatus, lastHealthCheck: new Date(), updatedAt: new Date() })
      .where(eq(agents.agentUuid, agentUuid));

    return { agentUuid, agentId: agent.agentId, previousStatus, newStatus, responseTimeMs, error };
  }
}

/**
 * Checks health of all non-deleted agents.
 * Runs checks concurrently (up to 10 at a time).
 */
export async function checkAllAgentsHealth(
  db: Database,
  timeoutMs = 10000,
  redis?: Redis,
): Promise<HealthCheckResult[]> {
  const allAgents = await db
    .select({ agentUuid: agents.agentUuid })
    .from(agents)
    .where(isNull(agents.deletedAt));

  if (allAgents.length === 0) return [];

  // Process in batches of 10 to avoid overwhelming network
  const batchSize = 10;
  const results: HealthCheckResult[] = [];

  for (let i = 0; i < allAgents.length; i += batchSize) {
    const batch = allAgents.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((a) => checkAgentHealth(db, a.agentUuid, timeoutMs)),
    );
    results.push(...batchResults);
  }

  // Invalidate agent capability cache if any status changed (Phase 2)
  const hasStatusChange = results.some((r) => r.previousStatus !== r.newStatus);
  if (hasStatusChange && redis) {
    await invalidateAgentCapabilityCache(redis).catch(() => {});
  }

  return results;
}
