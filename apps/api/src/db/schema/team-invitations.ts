import {
  pgTable,
  serial,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Team invitations — shareable invite codes for joining teams.
 * Users with owner/admin roles can create invitations with optional
 * expiry and usage limits. Other users can redeem them to join a team.
 */
export const teamInvitations = pgTable('team_invitations', {
  id: serial('id').primaryKey(),
  invitationUuid: uuid('invitation_uuid').defaultRandom().notNull().unique(),
  teamUuid: uuid('team_uuid').notNull(),
  inviteCode: varchar('invite_code', { length: 32 }).notNull().unique(),
  createdByUserUuid: varchar('created_by_user_uuid', { length: 36 }).notNull(),
  role: varchar('role', { length: 20 }).notNull().default('member'),
  maxUses: integer('max_uses').notNull().default(1),
  useCount: integer('use_count').notNull().default(0),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'), // Soft-revoke
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_team_invitations_team_uuid').on(table.teamUuid),
  index('idx_team_invitations_invite_code').on(table.inviteCode),
]);

export type TeamInvitation = typeof teamInvitations.$inferSelect;
export type NewTeamInvitation = typeof teamInvitations.$inferInsert;
