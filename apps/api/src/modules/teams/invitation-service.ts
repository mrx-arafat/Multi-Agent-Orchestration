/**
 * Team invitation service — create, accept, list, and revoke invite codes.
 * Invite codes are short shareable strings that allow users to join teams
 * without requiring the owner to know their UUID ahead of time.
 */
import crypto from 'node:crypto';
import { eq, and, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { teamInvitations, teamMembers } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Asserts the user has an owner or admin role on the team. Throws 403 otherwise.
 */
async function assertTeamAdmin(
  db: Database,
  teamUuid: string,
  userUuid: string,
): Promise<void> {
  const [member] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamUuid, teamUuid), eq(teamMembers.userUuid, userUuid)))
    .limit(1);

  if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
    throw ApiError.forbidden('Only team owners and admins can manage invitations');
  }
}

/**
 * Generates a random 8-character hex invite code.
 */
function generateInviteCode(): string {
  return crypto.randomBytes(4).toString('hex');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SafeInvitation {
  invitationUuid: string;
  teamUuid: string;
  inviteCode: string;
  createdByUserUuid: string;
  role: string;
  maxUses: number;
  useCount: number;
  expiresAt: Date | null;
  createdAt: Date;
}

/**
 * Creates a new team invitation. Only team owners and admins can create invitations.
 */
export async function createInvitation(
  db: Database,
  teamUuid: string,
  createdByUserUuid: string,
  opts?: { role?: string; maxUses?: number; expiresInHours?: number },
): Promise<SafeInvitation> {
  await assertTeamAdmin(db, teamUuid, createdByUserUuid);

  const role = opts?.role ?? 'member';
  const maxUses = opts?.maxUses ?? 1;
  const expiresAt = opts?.expiresInHours
    ? new Date(Date.now() + opts.expiresInHours * 60 * 60 * 1000)
    : null;

  const inviteCode = generateInviteCode();

  const [created] = await db
    .insert(teamInvitations)
    .values({
      teamUuid,
      inviteCode,
      createdByUserUuid,
      role,
      maxUses,
      expiresAt,
    })
    .returning();

  if (!created) throw ApiError.internal('Failed to create invitation');

  return {
    invitationUuid: created.invitationUuid,
    teamUuid: created.teamUuid,
    inviteCode: created.inviteCode,
    createdByUserUuid: created.createdByUserUuid,
    role: created.role,
    maxUses: created.maxUses,
    useCount: created.useCount,
    expiresAt: created.expiresAt,
    createdAt: created.createdAt,
  };
}

/**
 * Accepts an invitation using its invite code.
 * Validates the code is not expired, not revoked, and has not exceeded its max uses.
 * Adds the user as a team member and increments the use count.
 */
export async function acceptInvitation(
  db: Database,
  inviteCode: string,
  userUuid: string,
): Promise<{ teamUuid: string; role: string }> {
  // Find the invitation
  const [invitation] = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.inviteCode, inviteCode),
        isNull(teamInvitations.revokedAt),
      ),
    )
    .limit(1);

  if (!invitation) {
    throw ApiError.notFound('Invitation');
  }

  // Check expiry
  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    throw ApiError.badRequest('This invitation has expired');
  }

  // Check usage limit
  if (invitation.useCount >= invitation.maxUses) {
    throw ApiError.badRequest('This invitation has reached its maximum number of uses');
  }

  // Check if user is already a member
  const [existing] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.teamUuid, invitation.teamUuid),
        eq(teamMembers.userUuid, userUuid),
      ),
    )
    .limit(1);

  if (existing) {
    throw ApiError.conflict('You are already a member of this team');
  }

  // Add user as team member
  await db.insert(teamMembers).values({
    teamUuid: invitation.teamUuid,
    userUuid,
    role: invitation.role,
  });

  // Increment use count
  await db
    .update(teamInvitations)
    .set({
      useCount: sql`${teamInvitations.useCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(teamInvitations.id, invitation.id));

  return { teamUuid: invitation.teamUuid, role: invitation.role };
}

/**
 * Lists active (non-revoked) invitations for a team.
 * Only team owners and admins can list invitations.
 */
export async function listInvitations(
  db: Database,
  teamUuid: string,
  userUuid: string,
): Promise<SafeInvitation[]> {
  await assertTeamAdmin(db, teamUuid, userUuid);

  const rows = await db
    .select()
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.teamUuid, teamUuid),
        isNull(teamInvitations.revokedAt),
      ),
    );

  return rows.map((row) => ({
    invitationUuid: row.invitationUuid,
    teamUuid: row.teamUuid,
    inviteCode: row.inviteCode,
    createdByUserUuid: row.createdByUserUuid,
    role: row.role,
    maxUses: row.maxUses,
    useCount: row.useCount,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  }));
}

/**
 * Revokes an invitation by setting its revokedAt timestamp.
 * Only team owners and admins can revoke invitations.
 */
export async function revokeInvitation(
  db: Database,
  invitationUuid: string,
  userUuid: string,
): Promise<void> {
  // Find the invitation to get the teamUuid
  const [invitation] = await db
    .select({ teamUuid: teamInvitations.teamUuid })
    .from(teamInvitations)
    .where(
      and(
        eq(teamInvitations.invitationUuid, invitationUuid),
        isNull(teamInvitations.revokedAt),
      ),
    )
    .limit(1);

  if (!invitation) {
    throw ApiError.notFound('Invitation');
  }

  // Check permissions
  await assertTeamAdmin(db, invitation.teamUuid, userUuid);

  // Soft-revoke
  await db
    .update(teamInvitations)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(eq(teamInvitations.invitationUuid, invitationUuid));
}
