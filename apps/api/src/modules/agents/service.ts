/**
 * Agent service — registration, discovery, and lifecycle management.
 */
import bcrypt from 'bcryptjs';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { agents } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

const BCRYPT_ROUNDS = 12;

export interface SafeAgent {
  id: number;
  agentUuid: string;
  agentId: string;
  name: string;
  description: string | null;
  endpoint: string;
  capabilities: string[];
  maxConcurrentTasks: number;
  status: string;
  registeredByUserUuid: string | null;
  lastHealthCheck: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toSafeAgent(agent: typeof agents.$inferSelect): SafeAgent {
  return {
    id: agent.id,
    agentUuid: agent.agentUuid,
    agentId: agent.agentId,
    name: agent.name,
    description: agent.description ?? null,
    endpoint: agent.endpoint,
    capabilities: agent.capabilities,
    maxConcurrentTasks: agent.maxConcurrentTasks,
    status: agent.status,
    registeredByUserUuid: agent.registeredByUserUuid ?? null,
    lastHealthCheck: agent.lastHealthCheck ?? null,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export async function registerAgent(
  db: Database,
  params: {
    agentId: string;
    name: string;
    description?: string;
    endpoint: string;
    authToken: string;
    capabilities?: string[];
    maxConcurrentTasks?: number;
    registeredByUserUuid: string;
  },
): Promise<SafeAgent> {
  // Check duplicate agentId
  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.agentId, params.agentId), isNull(agents.deletedAt)))
    .limit(1);

  if (existing.length > 0) {
    throw ApiError.conflict(`Agent with id '${params.agentId}' already registered`);
  }

  const authTokenHash = await bcrypt.hash(params.authToken, BCRYPT_ROUNDS);

  try {
    const [created] = await db
      .insert(agents)
      .values({
        agentId: params.agentId,
        name: params.name,
        description: params.description,
        endpoint: params.endpoint,
        authTokenHash,
        capabilities: params.capabilities ?? [],
        maxConcurrentTasks: params.maxConcurrentTasks ?? 5,
        registeredByUserUuid: params.registeredByUserUuid,
        status: 'offline',
      })
      .returning();

    if (!created) throw ApiError.internal('Failed to create agent');
    return toSafeAgent(created);
  } catch (err) {
    // PostgreSQL unique constraint violation (23505) — concurrent duplicate insert
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
      throw ApiError.conflict(`Agent with id '${params.agentId}' already registered`);
    }
    throw err;
  }
}

export interface AgentListResult {
  agents: SafeAgent[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export async function listAgents(
  db: Database,
  params: { capability?: string; status?: string; page?: number; limit?: number },
): Promise<AgentListResult> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  // Build base conditions
  const conditions = [isNull(agents.deletedAt)];

  if (params.status) {
    conditions.push(eq(agents.status, params.status as 'online' | 'degraded' | 'offline'));
  }

  if (params.capability) {
    // PostgreSQL array contains operator
    conditions.push(sql`${agents.capabilities} @> ARRAY[${params.capability}]::text[]`);
  }

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.select().from(agents).where(whereClause).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agents)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    agents: rows.map(toSafeAgent),
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}

export async function getAgentByUuid(db: Database, agentUuid: string): Promise<SafeAgent> {
  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) {
    throw ApiError.notFound('Agent');
  }

  return toSafeAgent(agent);
}

export async function deleteAgent(
  db: Database,
  agentUuid: string,
  requestingUserUuid: string,
): Promise<void> {
  const [agent] = await db
    .select({ id: agents.id, registeredByUserUuid: agents.registeredByUserUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) {
    throw ApiError.notFound('Agent');
  }

  if (agent.registeredByUserUuid !== requestingUserUuid) {
    throw ApiError.forbidden('You can only delete agents you registered');
  }

  await db
    .update(agents)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(agents.agentUuid, agentUuid));
}
