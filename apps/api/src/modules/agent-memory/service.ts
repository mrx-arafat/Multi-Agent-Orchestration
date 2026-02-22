/**
 * Agent Memory service — long-term context for agents.
 * Supports episodic (task summaries), semantic (facts/patterns), and working memory.
 */
import { eq, and, desc, ilike, sql, gte, lte, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { agentMemory, type NewAgentMemory } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import crypto from 'node:crypto';

export interface StoreMemoryParams {
  agentUuid: string;
  memoryType: 'episodic' | 'semantic' | 'working';
  title: string;
  content: string;
  category?: string | undefined;
  importance?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
  workflowRunId?: string | undefined;
  teamUuid?: string | undefined;
  ttlSeconds?: number | undefined;
}

export interface RecallMemoryParams {
  agentUuid: string;
  memoryType?: 'episodic' | 'semantic' | 'working' | undefined;
  category?: string | undefined;
  query?: string | undefined;
  limit?: number | undefined;
  minImportance?: number | undefined;
}

export interface MemorySummary {
  agentUuid: string;
  totalMemories: number;
  byType: Record<string, number>;
  byCategory: Record<string, number>;
}

/**
 * Store a new memory for an agent.
 */
export async function storeAgentMemory(
  db: Database,
  params: StoreMemoryParams,
): Promise<typeof agentMemory.$inferSelect> {
  const values: NewAgentMemory = {
    agentUuid: params.agentUuid,
    memoryType: params.memoryType,
    title: params.title,
    content: params.content,
    category: params.category,
    importance: params.importance ?? 5,
    metadata: params.metadata ?? null,
    workflowRunId: params.workflowRunId,
    teamUuid: params.teamUuid,
    expiresAt: params.ttlSeconds
      ? new Date(Date.now() + params.ttlSeconds * 1000)
      : undefined,
  };

  const [memory] = await db.insert(agentMemory).values(values).returning();
  if (!memory) throw ApiError.internal('Failed to store agent memory');
  return memory;
}

/**
 * Recall memories for an agent with optional filtering and text search.
 */
export async function recallAgentMemory(
  db: Database,
  params: RecallMemoryParams,
): Promise<typeof agentMemory.$inferSelect[]> {
  const conditions = [
    eq(agentMemory.agentUuid, params.agentUuid),
  ];

  if (params.memoryType) {
    conditions.push(eq(agentMemory.memoryType, params.memoryType));
  }
  if (params.category) {
    conditions.push(eq(agentMemory.category, params.category));
  }
  if (params.minImportance) {
    conditions.push(gte(agentMemory.importance, params.minImportance));
  }

  // Filter out expired memories
  conditions.push(
    sql`(${agentMemory.expiresAt} IS NULL OR ${agentMemory.expiresAt} > NOW())`
  );

  let query = db.select().from(agentMemory).where(and(...conditions));

  // Text search on title and content
  if (params.query) {
    const searchTerm = `%${params.query}%`;
    query = db.select().from(agentMemory).where(
      and(
        ...conditions,
        sql`(${agentMemory.title} ILIKE ${searchTerm} OR ${agentMemory.content} ILIKE ${searchTerm})`,
      )
    );
  }

  const limit = params.limit ?? 20;
  const memories = await query
    .orderBy(desc(agentMemory.importance), desc(agentMemory.createdAt))
    .limit(limit);

  // Update access counts
  if (memories.length > 0) {
    const memoryIds = memories.map(m => m.id);
    await db.update(agentMemory)
      .set({
        accessCount: sql`${agentMemory.accessCount} + 1`,
        lastAccessedAt: new Date(),
      })
      .where(inArray(agentMemory.id, memoryIds))
      .catch(() => {}); // Best-effort
  }

  return memories;
}

/**
 * Get a single memory by UUID.
 */
export async function getMemoryByUuid(
  db: Database,
  memoryUuid: string,
): Promise<typeof agentMemory.$inferSelect> {
  const [memory] = await db.select().from(agentMemory)
    .where(eq(agentMemory.memoryUuid, memoryUuid))
    .limit(1);

  if (!memory) throw ApiError.notFound('Memory');
  return memory;
}

/**
 * Delete a memory entry.
 */
export async function deleteAgentMemory(
  db: Database,
  memoryUuid: string,
  agentUuid: string,
): Promise<void> {
  const result = await db.delete(agentMemory)
    .where(and(
      eq(agentMemory.memoryUuid, memoryUuid),
      eq(agentMemory.agentUuid, agentUuid),
    ))
    .returning();

  if (result.length === 0) throw ApiError.notFound('Memory');
}

/**
 * Auto-summarize workflow execution into episodic memory.
 */
export async function summarizeWorkflowExecution(
  db: Database,
  params: {
    agentUuid: string;
    workflowRunId: string;
    workflowName: string;
    stageResults: Array<{ stageId: string; capability: string; status: string }>;
    totalDurationMs: number;
    teamUuid?: string;
  },
): Promise<typeof agentMemory.$inferSelect> {
  const successCount = params.stageResults.filter(s => s.status === 'completed').length;
  const totalCount = params.stageResults.length;
  const capabilities = [...new Set(params.stageResults.map(s => s.capability))];

  const content = [
    `Workflow "${params.workflowName}" (${params.workflowRunId})`,
    `Stages: ${successCount}/${totalCount} completed`,
    `Capabilities used: ${capabilities.join(', ')}`,
    `Duration: ${params.totalDurationMs}ms`,
  ].join('\n');

  return storeAgentMemory(db, {
    agentUuid: params.agentUuid,
    memoryType: 'episodic',
    title: `Workflow: ${params.workflowName}`,
    content,
    category: 'workflow_execution',
    importance: successCount === totalCount ? 5 : 7,
    metadata: {
      workflowName: params.workflowName,
      successRate: successCount / totalCount,
      capabilities,
      durationMs: params.totalDurationMs,
    },
    workflowRunId: params.workflowRunId,
    teamUuid: params.teamUuid,
  });
}

/**
 * Get memory summary statistics for an agent.
 */
export async function getMemorySummary(
  db: Database,
  agentUuid: string,
): Promise<MemorySummary> {
  const memories = await db.select({
    memoryType: agentMemory.memoryType,
    category: agentMemory.category,
  }).from(agentMemory)
    .where(and(
      eq(agentMemory.agentUuid, agentUuid),
      sql`(${agentMemory.expiresAt} IS NULL OR ${agentMemory.expiresAt} > NOW())`,
    ));

  const byType: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const m of memories) {
    byType[m.memoryType] = (byType[m.memoryType] ?? 0) + 1;
    if (m.category) {
      byCategory[m.category] = (byCategory[m.category] ?? 0) + 1;
    }
  }

  return {
    agentUuid,
    totalMemories: memories.length,
    byType,
    byCategory,
  };
}
