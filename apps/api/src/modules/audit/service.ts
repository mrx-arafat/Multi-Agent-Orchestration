/**
 * Audit trail service.
 * Append-only log of every stage execution event.
 * SHA-256 hashes of inputs/outputs for immutable audit trail.
 */
import { createHash } from 'crypto';
import { eq, asc } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { executionLogs, workflowRuns } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

/**
 * Recursively sorts all object keys for deterministic JSON serialization.
 * Arrays preserve order; primitives pass through unchanged.
 */
function deepSortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

/**
 * Computes a deterministic SHA-256 hash of a JSON-serializable value.
 * All object keys are recursively sorted for determinism at every level.
 */
export function hashPayload(payload: unknown): string {
  const normalized = JSON.stringify(deepSortKeys(payload));
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Appends an audit log entry for a stage execution.
 * Called by the workflow worker after each stage action.
 */
export async function logStageExecution(
  db: Database,
  params: {
    workflowRunId: string;
    stageId: string;
    agentId: string;
    action: 'execute' | 'retry' | 'fail';
    input?: unknown;
    output?: unknown;
    status: string;
  },
): Promise<void> {
  await db.insert(executionLogs).values({
    workflowRunId: params.workflowRunId,
    stageId: params.stageId,
    agentId: params.agentId,
    action: params.action,
    inputHash: params.input !== undefined ? hashPayload(params.input) : null,
    outputHash: params.output !== undefined ? hashPayload(params.output) : null,
    status: params.status,
    signature: null, // Phase 2
  });
}

/**
 * Retrieves all audit log entries for a workflow run in chronological order.
 * Verifies workflow ownership before returning.
 */
export async function getAuditTrail(
  db: Database,
  workflowRunId: string,
  requestingUserUuid: string,
): Promise<{ workflowRunId: string; logs: typeof executionLogs.$inferSelect[] }> {
  // Verify workflow exists and belongs to requesting user
  const [run] = await db
    .select({ userUuid: workflowRuns.userUuid })
    .from(workflowRuns)
    .where(eq(workflowRuns.workflowRunId, workflowRunId))
    .limit(1);

  if (!run) {
    throw ApiError.notFound('Workflow run');
  }

  if (run.userUuid !== requestingUserUuid) {
    throw ApiError.forbidden('Access denied');
  }

  const logs = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.workflowRunId, workflowRunId))
    .orderBy(asc(executionLogs.loggedAt));

  return { workflowRunId, logs };
}
