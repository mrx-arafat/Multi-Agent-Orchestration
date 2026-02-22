/**
 * Team service — create, manage, and enforce team isolation.
 * Teams are the primary isolation boundary: agents, kanban tasks,
 * and messages are all scoped to a team.
 */
import { eq, and, isNull, sql, inArray } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { teams, teamMembers, agents } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

export interface SafeTeam {
  teamUuid: string;
  name: string;
  description: string | null;
  ownerUserUuid: string;
  maxAgents: number;
  agentCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function createTeam(
  db: Database,
  params: {
    name: string;
    description?: string;
    ownerUserUuid: string;
    maxAgents?: number;
  },
): Promise<SafeTeam> {
  const [created] = await db
    .insert(teams)
    .values({
      name: params.name,
      description: params.description,
      ownerUserUuid: params.ownerUserUuid,
      maxAgents: params.maxAgents ?? 10,
    })
    .returning();

  if (!created) throw ApiError.internal('Failed to create team');

  // Add owner as a member
  await db.insert(teamMembers).values({
    teamUuid: created.teamUuid,
    userUuid: params.ownerUserUuid,
    role: 'owner',
  });

  return {
    teamUuid: created.teamUuid,
    name: created.name,
    description: created.description ?? null,
    ownerUserUuid: created.ownerUserUuid,
    maxAgents: created.maxAgents,
    agentCount: 0,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

export async function getTeam(
  db: Database,
  teamUuid: string,
  requestingUserUuid: string,
): Promise<SafeTeam> {
  const [team] = await db
    .select()
    .from(teams)
    .where(and(eq(teams.teamUuid, teamUuid), isNull(teams.archivedAt)))
    .limit(1);

  if (!team) throw ApiError.notFound('Team');

  // Check membership
  await assertTeamMember(db, teamUuid, requestingUserUuid);

  // Count agents in this team
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(eq(agents.teamUuid, teamUuid), isNull(agents.deletedAt)));

  return {
    teamUuid: team.teamUuid,
    name: team.name,
    description: team.description ?? null,
    ownerUserUuid: team.ownerUserUuid,
    maxAgents: team.maxAgents,
    agentCount: countResult?.count ?? 0,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  };
}

export async function listUserTeams(
  db: Database,
  userUuid: string,
): Promise<SafeTeam[]> {
  const memberships = await db
    .select({ teamUuid: teamMembers.teamUuid })
    .from(teamMembers)
    .where(eq(teamMembers.userUuid, userUuid));

  if (memberships.length === 0) return [];

  const teamUuids = memberships.map((m) => m.teamUuid);

  const rows = await db
    .select()
    .from(teams)
    .where(and(inArray(teams.teamUuid, teamUuids), isNull(teams.archivedAt)));

  return rows.map((team) => ({
    teamUuid: team.teamUuid,
    name: team.name,
    description: team.description ?? null,
    ownerUserUuid: team.ownerUserUuid,
    maxAgents: team.maxAgents,
    createdAt: team.createdAt,
    updatedAt: team.updatedAt,
  }));
}

/**
 * Adds an agent to a team. Enforces max agent limit.
 */
export async function addAgentToTeam(
  db: Database,
  teamUuid: string,
  agentUuid: string,
  requestingUserUuid: string,
): Promise<void> {
  await assertTeamMember(db, teamUuid, requestingUserUuid);

  const [team] = await db
    .select({ maxAgents: teams.maxAgents })
    .from(teams)
    .where(and(eq(teams.teamUuid, teamUuid), isNull(teams.archivedAt)))
    .limit(1);

  if (!team) throw ApiError.notFound('Team');

  // Check agent limit
  const [countResult] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(agents)
    .where(and(eq(agents.teamUuid, teamUuid), isNull(agents.deletedAt)));

  if ((countResult?.count ?? 0) >= team.maxAgents) {
    throw ApiError.badRequest(`Team has reached its maximum of ${team.maxAgents} agents`);
  }

  // Verify agent exists
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid })
    .from(agents)
    .where(and(eq(agents.agentUuid, agentUuid), isNull(agents.deletedAt)))
    .limit(1);

  if (!agent) throw ApiError.notFound('Agent');

  await db
    .update(agents)
    .set({ teamUuid, updatedAt: new Date() })
    .where(eq(agents.agentUuid, agentUuid));
}

/**
 * Removes an agent from a team.
 */
export async function removeAgentFromTeam(
  db: Database,
  teamUuid: string,
  agentUuid: string,
  requestingUserUuid: string,
): Promise<void> {
  await assertTeamMember(db, teamUuid, requestingUserUuid);

  await db
    .update(agents)
    .set({ teamUuid: null, updatedAt: new Date() })
    .where(and(eq(agents.agentUuid, agentUuid), eq(agents.teamUuid, teamUuid)));
}

/**
 * Lists all agents in a team (team isolation enforced).
 */
export async function listTeamAgents(
  db: Database,
  teamUuid: string,
  requestingUserUuid: string,
): Promise<{ agentUuid: string; agentId: string; name: string; agentType: string; capabilities: string[]; status: string }[]> {
  await assertTeamMember(db, teamUuid, requestingUserUuid);

  return db
    .select({
      agentUuid: agents.agentUuid,
      agentId: agents.agentId,
      name: agents.name,
      agentType: agents.agentType,
      capabilities: agents.capabilities,
      status: agents.status,
    })
    .from(agents)
    .where(and(eq(agents.teamUuid, teamUuid), isNull(agents.deletedAt)));
}

/**
 * Adds a user as a team member.
 */
export async function addTeamMember(
  db: Database,
  teamUuid: string,
  userUuid: string,
  role: string,
  requestingUserUuid: string,
): Promise<void> {
  // Only owner/admin can add members
  const [requester] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamUuid, teamUuid), eq(teamMembers.userUuid, requestingUserUuid)))
    .limit(1);

  if (!requester || (requester.role !== 'owner' && requester.role !== 'admin')) {
    throw ApiError.forbidden('Only team owners and admins can add members');
  }

  // Check not already a member
  const [existing] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamUuid, teamUuid), eq(teamMembers.userUuid, userUuid)))
    .limit(1);

  if (existing) throw ApiError.conflict('User is already a team member');

  await db.insert(teamMembers).values({ teamUuid, userUuid, role });
}

/**
 * Asserts the user is a member of the team. Throws 403 if not.
 */
export async function assertTeamMember(
  db: Database,
  teamUuid: string,
  userUuid: string,
): Promise<void> {
  const [member] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamUuid, teamUuid), eq(teamMembers.userUuid, userUuid)))
    .limit(1);

  if (!member) {
    throw ApiError.forbidden('You are not a member of this team');
  }
}
