/**
 * Agent Versioning service — immutable versions, canary deployments, rollback.
 */
import { eq, and, desc, sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { agentVersions, type NewAgentVersion } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

type VersionStatus = 'draft' | 'active' | 'canary' | 'inactive' | 'rolled_back';
type DeploymentStrategy = 'direct' | 'canary' | 'blue_green';

export interface CreateVersionParams {
  agentUuid: string;
  version: string;
  endpoint: string;
  capabilities?: string[] | undefined;
  config?: Record<string, unknown> | undefined;
  deploymentStrategy?: DeploymentStrategy | undefined;
  errorThreshold?: number | undefined;
  releaseNotes?: string | undefined;
  createdByUserUuid: string;
  teamUuid?: string | undefined;
}

export interface PromoteVersionParams {
  versionUuid: string;
  strategy: DeploymentStrategy;
  trafficPercent?: number | undefined;
}

/**
 * Create a new agent version.
 */
export async function createVersion(
  db: Database,
  params: CreateVersionParams,
): Promise<typeof agentVersions.$inferSelect> {
  // Check for duplicate version
  const [existing] = await db.select().from(agentVersions)
    .where(and(
      eq(agentVersions.agentUuid, params.agentUuid),
      eq(agentVersions.version, params.version),
    ))
    .limit(1);

  if (existing) throw ApiError.conflict(`Version ${params.version} already exists for this agent`);

  const values: NewAgentVersion = {
    agentUuid: params.agentUuid,
    version: params.version,
    endpoint: params.endpoint,
    capabilities: params.capabilities ?? [],
    config: params.config ?? null,
    deploymentStrategy: params.deploymentStrategy ?? 'direct',
    errorThreshold: params.errorThreshold ?? 50,
    releaseNotes: params.releaseNotes,
    createdByUserUuid: params.createdByUserUuid,
    teamUuid: params.teamUuid,
  };

  const [version] = await db.insert(agentVersions).values(values).returning();
  if (!version) throw ApiError.internal('Failed to create version');
  return version;
}

/**
 * Promote a version to active. Handles direct, canary, and blue/green strategies.
 */
export async function promoteVersion(
  db: Database,
  params: PromoteVersionParams,
): Promise<typeof agentVersions.$inferSelect> {
  const [version] = await db.select().from(agentVersions)
    .where(eq(agentVersions.versionUuid, params.versionUuid))
    .limit(1);

  if (!version) throw ApiError.notFound('Version');

  if (params.strategy === 'direct') {
    // Deactivate all other versions for this agent
    await db.update(agentVersions)
      .set({ status: 'inactive', trafficPercent: 0, updatedAt: new Date() })
      .where(and(
        eq(agentVersions.agentUuid, version.agentUuid),
        sql`${agentVersions.versionUuid} != ${params.versionUuid}`,
        eq(agentVersions.status, 'active'),
      ));

    const [promoted] = await db.update(agentVersions)
      .set({
        status: 'active',
        trafficPercent: 100,
        promotedAt: new Date(),
        isRollbackTarget: true,
        updatedAt: new Date(),
      })
      .where(eq(agentVersions.id, version.id))
      .returning();

    return promoted!;
  }

  if (params.strategy === 'canary') {
    const trafficPercent = params.trafficPercent ?? 10;

    // Reduce active version traffic
    await db.update(agentVersions)
      .set({
        trafficPercent: 100 - trafficPercent,
        updatedAt: new Date(),
      })
      .where(and(
        eq(agentVersions.agentUuid, version.agentUuid),
        eq(agentVersions.status, 'active'),
      ));

    const [promoted] = await db.update(agentVersions)
      .set({
        status: 'canary',
        trafficPercent,
        deploymentStrategy: 'canary',
        promotedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentVersions.id, version.id))
      .returning();

    return promoted!;
  }

  if (params.strategy === 'blue_green') {
    // Blue/green: instant swap. Mark current active as inactive, new as active.
    await db.update(agentVersions)
      .set({ status: 'inactive', trafficPercent: 0, updatedAt: new Date() })
      .where(and(
        eq(agentVersions.agentUuid, version.agentUuid),
        eq(agentVersions.status, 'active'),
      ));

    const [promoted] = await db.update(agentVersions)
      .set({
        status: 'active',
        trafficPercent: 100,
        deploymentStrategy: 'blue_green',
        promotedAt: new Date(),
        isRollbackTarget: true,
        updatedAt: new Date(),
      })
      .where(eq(agentVersions.id, version.id))
      .returning();

    return promoted!;
  }

  throw ApiError.badRequest(`Unknown deployment strategy: ${params.strategy}`);
}

/**
 * Rollback to the last known-good version.
 */
export async function rollbackVersion(
  db: Database,
  agentUuid: string,
): Promise<typeof agentVersions.$inferSelect> {
  // Find the current active version
  const [currentActive] = await db.select().from(agentVersions)
    .where(and(
      eq(agentVersions.agentUuid, agentUuid),
      eq(agentVersions.status, 'active'),
    ))
    .limit(1);

  // Find the last rollback target
  const [rollbackTarget] = await db.select().from(agentVersions)
    .where(and(
      eq(agentVersions.agentUuid, agentUuid),
      eq(agentVersions.isRollbackTarget, true),
      eq(agentVersions.status, 'inactive'),
    ))
    .orderBy(desc(agentVersions.promotedAt))
    .limit(1);

  if (!rollbackTarget) {
    throw ApiError.badRequest('No rollback target available');
  }

  // Mark current as rolled back
  if (currentActive) {
    await db.update(agentVersions)
      .set({
        status: 'rolled_back',
        trafficPercent: 0,
        rolledBackAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentVersions.id, currentActive.id));
  }

  // Also roll back any canary versions
  await db.update(agentVersions)
    .set({ status: 'rolled_back', trafficPercent: 0, rolledBackAt: new Date(), updatedAt: new Date() })
    .where(and(
      eq(agentVersions.agentUuid, agentUuid),
      eq(agentVersions.status, 'canary'),
    ));

  // Activate the rollback target
  const [restored] = await db.update(agentVersions)
    .set({
      status: 'active',
      trafficPercent: 100,
      promotedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(agentVersions.id, rollbackTarget.id))
    .returning();

  return restored!;
}

/**
 * Record an error for a version (for auto-rollback).
 */
export async function recordVersionError(
  db: Database,
  versionUuid: string,
): Promise<{ autoRolledBack: boolean; errorRate: number }> {
  const [version] = await db.select().from(agentVersions)
    .where(eq(agentVersions.versionUuid, versionUuid))
    .limit(1);

  if (!version) return { autoRolledBack: false, errorRate: 0 };

  const newTotalErrors = version.totalErrors + 1;
  const newTotalRequests = version.totalRequests + 1;
  const errorRate = Math.round((newTotalErrors / newTotalRequests) * 1000);

  await db.update(agentVersions)
    .set({
      totalErrors: newTotalErrors,
      totalRequests: newTotalRequests,
      errorRate,
      updatedAt: new Date(),
    })
    .where(eq(agentVersions.id, version.id));

  // Auto-rollback if error rate exceeds threshold
  if (errorRate > version.errorThreshold && (version.status === 'canary' || version.status === 'active')) {
    await rollbackVersion(db, version.agentUuid).catch(() => {});
    return { autoRolledBack: true, errorRate };
  }

  return { autoRolledBack: false, errorRate };
}

/**
 * Record a successful request for a version.
 */
export async function recordVersionSuccess(
  db: Database,
  versionUuid: string,
): Promise<void> {
  await db.update(agentVersions)
    .set({
      totalRequests: sql`${agentVersions.totalRequests} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(agentVersions.versionUuid, versionUuid));
}

/**
 * List versions for an agent.
 */
export async function listVersions(
  db: Database,
  agentUuid: string,
): Promise<typeof agentVersions.$inferSelect[]> {
  return db.select().from(agentVersions)
    .where(eq(agentVersions.agentUuid, agentUuid))
    .orderBy(desc(agentVersions.createdAt));
}

/**
 * Get a specific version.
 */
export async function getVersion(
  db: Database,
  versionUuid: string,
): Promise<typeof agentVersions.$inferSelect> {
  const [version] = await db.select().from(agentVersions)
    .where(eq(agentVersions.versionUuid, versionUuid))
    .limit(1);

  if (!version) throw ApiError.notFound('Version');
  return version;
}

/**
 * Resolve which version should handle a request (supports canary traffic splitting).
 */
export async function resolveActiveVersion(
  db: Database,
  agentUuid: string,
): Promise<typeof agentVersions.$inferSelect | null> {
  const versions = await db.select().from(agentVersions)
    .where(and(
      eq(agentVersions.agentUuid, agentUuid),
      sql`${agentVersions.status} IN ('active', 'canary')`,
    ))
    .orderBy(desc(agentVersions.trafficPercent));

  if (versions.length === 0) return null;
  if (versions.length === 1) return versions[0]!;

  // Traffic splitting: random selection weighted by traffic percent
  const rand = Math.random() * 100;
  let cumulative = 0;
  for (const v of versions) {
    cumulative += v.trafficPercent;
    if (rand < cumulative) return v;
  }

  return versions[0]!;
}
