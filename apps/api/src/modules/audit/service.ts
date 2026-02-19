/**
 * Audit trail service.
 * Append-only log of every stage execution event.
 * SHA-256 hashes of inputs/outputs for immutable audit trail.
 * RS256 cryptographic signatures for tamper-evident proof (FR-5.2).
 */
import { createHash } from 'crypto';
import { eq, asc } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { executionLogs, workflowRuns } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import { deepSortKeys, signPayload, verifySignature } from '../../lib/signing.js';
import { parseEnv } from '../../config/env.js';

/**
 * Computes a deterministic SHA-256 hash of a JSON-serializable value.
 * All object keys are recursively sorted for determinism at every level.
 */
export function hashPayload(payload: unknown): string {
  const normalized = JSON.stringify(deepSortKeys(payload));
  return createHash('sha256').update(normalized).digest('hex');
}

/** Returns the configured signing key, or null if not configured. */
function getSigningKey(): string | null {
  const env = parseEnv();
  return env.MAOF_AUDIT_SIGNING_KEY ?? null;
}

/**
 * Builds the canonical payload that gets signed for an audit log entry.
 * This is the exact set of fields that proves integrity.
 */
function buildSigningPayload(params: {
  workflowRunId: string;
  stageId: string;
  agentId: string;
  action: string;
  inputHash: string | null;
  outputHash: string | null;
  status: string;
  timestamp: string;
}): Record<string, unknown> {
  return {
    workflowRunId: params.workflowRunId,
    stageId: params.stageId,
    agentId: params.agentId,
    action: params.action,
    inputHash: params.inputHash,
    outputHash: params.outputHash,
    status: params.status,
    timestamp: params.timestamp,
  };
}

/**
 * Appends an audit log entry for a stage execution.
 * Called by the workflow worker after each stage action.
 * Signs the entry with MAOF's private key if configured (FR-5.2).
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
  const inputHash = params.input !== undefined ? hashPayload(params.input) : null;
  const outputHash = params.output !== undefined ? hashPayload(params.output) : null;
  const timestamp = new Date().toISOString();

  let signature: Record<string, string> | null = null;
  const signingKey = getSigningKey();
  if (signingKey) {
    const payload = buildSigningPayload({
      workflowRunId: params.workflowRunId,
      stageId: params.stageId,
      agentId: params.agentId,
      action: params.action,
      inputHash,
      outputHash,
      status: params.status,
      timestamp,
    });
    signature = {
      algorithm: 'RS256',
      value: signPayload(payload, signingKey),
      signer: 'maof-core',
      timestamp,
    };
  }

  await db.insert(executionLogs).values({
    workflowRunId: params.workflowRunId,
    stageId: params.stageId,
    agentId: params.agentId,
    action: params.action,
    inputHash,
    outputHash,
    status: params.status,
    signature,
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
  requestingUserRole = 'user',
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

  // Admin can access any audit trail; regular users only their own
  if (requestingUserRole !== 'admin' && run.userUuid !== requestingUserUuid) {
    throw ApiError.forbidden('Access denied');
  }

  const logs = await db
    .select()
    .from(executionLogs)
    .where(eq(executionLogs.workflowRunId, workflowRunId))
    .orderBy(asc(executionLogs.loggedAt));

  return { workflowRunId, logs };
}

/**
 * Verifies all cryptographic signatures in a workflow's audit trail.
 * Returns a summary of verification results.
 */
export async function verifyAuditTrail(
  db: Database,
  workflowRunId: string,
  requestingUserUuid: string,
  requestingUserRole = 'user',
): Promise<{ verified: boolean; total: number; valid: number; invalid: number; unsigned: number }> {
  const { logs } = await getAuditTrail(db, workflowRunId, requestingUserUuid, requestingUserRole);

  const env = parseEnv();
  const publicKey = env.MAOF_AUDIT_SIGNING_PUBLIC_KEY;

  let valid = 0;
  let invalid = 0;
  let unsigned = 0;

  for (const log of logs) {
    const sig = log.signature as { algorithm: string; value: string; signer: string; timestamp: string } | null;
    if (!sig) {
      unsigned++;
      continue;
    }

    if (!publicKey) {
      // No public key configured — can't verify, treat as unsigned
      unsigned++;
      continue;
    }

    const payload = buildSigningPayload({
      workflowRunId: log.workflowRunId,
      stageId: log.stageId,
      agentId: log.agentId,
      action: log.action,
      inputHash: log.inputHash,
      outputHash: log.outputHash,
      status: log.status,
      timestamp: sig.timestamp,
    });

    if (verifySignature(payload, sig.value, publicKey)) {
      valid++;
    } else {
      invalid++;
    }
  }

  const total = logs.length;
  return { verified: invalid === 0 && unsigned === 0 && total > 0, total, valid, invalid, unsigned };
}
