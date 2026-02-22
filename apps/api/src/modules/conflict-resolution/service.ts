/**
 * Conflict Resolution service — distributed locking for multi-agent systems.
 * Provides optimistic locking, conflict detection, and merge strategies.
 */
import { eq, and, sql, lte } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { resourceLocks, type NewResourceLock } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import crypto from 'node:crypto';

export interface AcquireLockParams {
  resourceType: string;
  resourceId: string;
  ownerAgentUuid: string;
  ownerWorkflowRunId?: string | undefined;
  conflictStrategy?: 'fail' | 'queue' | 'merge' | 'escalate' | undefined;
  timeoutSeconds?: number | undefined;
  contentHash?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  teamUuid?: string | undefined;
}

export interface ReleaseLockParams {
  lockUuid: string;
  ownerAgentUuid: string;
}

/**
 * Acquire a lock on a resource. Fails if resource is already locked (unless expired).
 */
export async function acquireLock(
  db: Database,
  params: AcquireLockParams,
): Promise<typeof resourceLocks.$inferSelect> {
  const timeoutSeconds = params.timeoutSeconds ?? 30;
  const expiresAt = new Date(Date.now() + timeoutSeconds * 1000);

  // Clean up expired locks first
  await db.update(resourceLocks)
    .set({ status: 'expired', releasedAt: new Date() })
    .where(and(
      eq(resourceLocks.resourceType, params.resourceType),
      eq(resourceLocks.resourceId, params.resourceId),
      eq(resourceLocks.status, 'active'),
      lte(resourceLocks.expiresAt, new Date()),
    ));

  // Check for existing active lock
  const [existing] = await db.select().from(resourceLocks)
    .where(and(
      eq(resourceLocks.resourceType, params.resourceType),
      eq(resourceLocks.resourceId, params.resourceId),
      eq(resourceLocks.status, 'active'),
    ))
    .limit(1);

  if (existing) {
    // Same agent can re-acquire (idempotent)
    if (existing.ownerAgentUuid === params.ownerAgentUuid) {
      const [updated] = await db.update(resourceLocks)
        .set({
          expiresAt,
          version: existing.version + 1,
          contentHash: params.contentHash ?? existing.contentHash,
        })
        .where(eq(resourceLocks.id, existing.id))
        .returning();
      return updated!;
    }

    throw new ApiError(
      409,
      'RESOURCE_LOCKED',
      `Resource ${params.resourceType}:${params.resourceId} is locked by another agent`,
      {
        lockedBy: existing.ownerAgentUuid,
        expiresAt: existing.expiresAt.toISOString(),
        lockUuid: existing.lockUuid,
      },
    );
  }

  const values: NewResourceLock = {
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    ownerAgentUuid: params.ownerAgentUuid,
    ownerWorkflowRunId: params.ownerWorkflowRunId,
    conflictStrategy: params.conflictStrategy ?? 'fail',
    contentHash: params.contentHash,
    expiresAt,
    metadata: params.metadata ?? null,
    teamUuid: params.teamUuid,
  };

  const [lock] = await db.insert(resourceLocks).values(values).returning();
  if (!lock) throw ApiError.internal('Failed to acquire lock');
  return lock;
}

/**
 * Release a lock on a resource.
 */
export async function releaseLock(
  db: Database,
  params: ReleaseLockParams,
): Promise<void> {
  const result = await db.update(resourceLocks)
    .set({ status: 'released', releasedAt: new Date() })
    .where(and(
      eq(resourceLocks.lockUuid, params.lockUuid),
      eq(resourceLocks.ownerAgentUuid, params.ownerAgentUuid),
      eq(resourceLocks.status, 'active'),
    ))
    .returning();

  if (result.length === 0) {
    throw ApiError.notFound('Lock not found or not owned by this agent');
  }
}

/**
 * Check if a resource is currently locked.
 */
export async function checkLock(
  db: Database,
  resourceType: string,
  resourceId: string,
): Promise<typeof resourceLocks.$inferSelect | null> {
  // Clean expired
  await db.update(resourceLocks)
    .set({ status: 'expired', releasedAt: new Date() })
    .where(and(
      eq(resourceLocks.resourceType, resourceType),
      eq(resourceLocks.resourceId, resourceId),
      eq(resourceLocks.status, 'active'),
      lte(resourceLocks.expiresAt, new Date()),
    ));

  const [lock] = await db.select().from(resourceLocks)
    .where(and(
      eq(resourceLocks.resourceType, resourceType),
      eq(resourceLocks.resourceId, resourceId),
      eq(resourceLocks.status, 'active'),
    ))
    .limit(1);

  return lock ?? null;
}

/**
 * Check content hash for optimistic locking.
 * Returns true if content has changed (conflict detected).
 */
export async function detectConflict(
  db: Database,
  lockUuid: string,
  currentContentHash: string,
): Promise<{ conflict: boolean; lock: typeof resourceLocks.$inferSelect | null }> {
  const [lock] = await db.select().from(resourceLocks)
    .where(eq(resourceLocks.lockUuid, lockUuid))
    .limit(1);

  if (!lock) return { conflict: false, lock: null };

  const conflict = lock.contentHash !== null && lock.contentHash !== currentContentHash;
  return { conflict, lock };
}

/**
 * Force-release all locks for an agent (e.g., agent went offline).
 */
export async function releaseAllAgentLocks(
  db: Database,
  agentUuid: string,
): Promise<number> {
  const result = await db.update(resourceLocks)
    .set({ status: 'released', releasedAt: new Date() })
    .where(and(
      eq(resourceLocks.ownerAgentUuid, agentUuid),
      eq(resourceLocks.status, 'active'),
    ))
    .returning();

  return result.length;
}

/**
 * List all active locks (for monitoring).
 */
export async function listActiveLocks(
  db: Database,
  teamUuid?: string,
): Promise<typeof resourceLocks.$inferSelect[]> {
  // Clean expired first
  await db.update(resourceLocks)
    .set({ status: 'expired', releasedAt: new Date() })
    .where(and(
      eq(resourceLocks.status, 'active'),
      lte(resourceLocks.expiresAt, new Date()),
    ));

  const conditions = [eq(resourceLocks.status, 'active')];
  if (teamUuid) {
    conditions.push(eq(resourceLocks.teamUuid, teamUuid));
  }

  return db.select().from(resourceLocks)
    .where(and(...conditions))
    .orderBy(resourceLocks.acquiredAt);
}
