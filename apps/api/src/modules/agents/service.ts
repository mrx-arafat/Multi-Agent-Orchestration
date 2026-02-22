/**
 * Agent service — registration, discovery, and lifecycle management.
 */
import bcrypt from 'bcryptjs';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { agents, teams, teamMembers } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { getConfig } from '../../config/index.js';

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
  agentType: string;
  teamUuid: string | null;
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
    agentType: agent.agentType,
    teamUuid: agent.teamUuid ?? null,
    status: agent.status,
    registeredByUserUuid: agent.registeredByUserUuid ?? null,
    lastHealthCheck: agent.lastHealthCheck ?? null,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

export interface RegisterAgentResult {
  agent: SafeAgent;
  /** If a team was auto-created, contains the team details */
  team?: { teamUuid: string; name: string };
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
    agentType?: string;
    teamUuid?: string;
    /** Auto-create a team for this agent. The registering user becomes team owner. */
    createTeam?: boolean;
    /** Custom team name (used when createTeam is true) */
    teamName?: string;
    registeredByUserUuid: string;
  },
): Promise<RegisterAgentResult> {
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

  // Encrypt the auth token for MAOF-to-agent calls (if encryption key is configured)
  const config = getConfig();
  const authTokenEncrypted = config.MAOF_AGENT_TOKEN_KEY
    ? encrypt(params.authToken, config.MAOF_AGENT_TOKEN_KEY)
    : null;

  // Auto-create team if requested
  let teamUuid = params.teamUuid;
  let createdTeam: { teamUuid: string; name: string } | undefined;

  if (params.createTeam && !teamUuid) {
    const teamName = params.teamName ?? `${params.name}'s Team`;
    const [team] = await db
      .insert(teams)
      .values({
        name: teamName,
        description: `Auto-created team for agent ${params.name}`,
        ownerUserUuid: params.registeredByUserUuid,
        maxAgents: 10,
      })
      .returning();

    if (!team) throw ApiError.internal('Failed to create team for agent');

    // Add owner as team member
    await db.insert(teamMembers).values({
      teamUuid: team.teamUuid,
      userUuid: params.registeredByUserUuid,
      role: 'owner',
    });

    teamUuid = team.teamUuid;
    createdTeam = { teamUuid: team.teamUuid, name: team.name };
  }

  try {
    const [created] = await db
      .insert(agents)
      .values({
        agentId: params.agentId,
        name: params.name,
        description: params.description,
        endpoint: params.endpoint,
        authTokenHash,
        authTokenEncrypted,
        capabilities: params.capabilities ?? [],
        maxConcurrentTasks: params.maxConcurrentTasks ?? 5,
        agentType: (params.agentType ?? 'generic') as 'generic' | 'openclaw' | 'builtin',
        teamUuid,
        registeredByUserUuid: params.registeredByUserUuid,
        status: 'offline',
      })
      .returning();

    if (!created) throw ApiError.internal('Failed to create agent');

    return {
      agent: toSafeAgent(created),
      ...(createdTeam ? { team: createdTeam } : {}),
    };
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
  const limit = Math.min(params.limit ?? 20, 100);
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

/**
 * Returns the decrypted auth token for an agent (used for MAOF-to-agent calls).
 * Throws if the token is not available or encryption key is missing.
 */
export async function getAgentAuthToken(db: Database, agentUuid: string): Promise<string> {
  const [agent] = await db
    .select({ authTokenEncrypted: agents.authTokenEncrypted })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) {
    throw ApiError.notFound('Agent');
  }

  if (!agent.authTokenEncrypted) {
    throw ApiError.internal('Agent auth token not available for dispatch (re-register agent)');
  }

  const config = getConfig();
  if (!config.MAOF_AGENT_TOKEN_KEY) {
    throw ApiError.internal('MAOF_AGENT_TOKEN_KEY not configured');
  }

  return decrypt(agent.authTokenEncrypted, config.MAOF_AGENT_TOKEN_KEY);
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
