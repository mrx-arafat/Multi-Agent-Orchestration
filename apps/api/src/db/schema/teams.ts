import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  integer,
  jsonb,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

/**
 * Teams table — isolated groups of agents that work together.
 * Each team is a self-contained unit: its own agents, kanban board,
 * messaging channel, and workflow scope. Teams are fully isolated —
 * agents in one team cannot see or communicate with agents in another.
 */
export const teams = pgTable('teams', {
  id: serial('id').primaryKey(),
  teamUuid: uuid('team_uuid').defaultRandom().notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  ownerUserUuid: uuid('owner_user_uuid').notNull(), // User who created the team
  maxAgents: integer('max_agents').notNull().default(10), // Max agents in this team
  settings: jsonb('settings'), // Team-level config (e.g., default model, timeout)
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  archivedAt: timestamp('archived_at'), // Soft-archive
}, (table) => [
  index('idx_teams_owner_user_uuid').on(table.ownerUserUuid),
]);

/**
 * Team members — maps users to teams with roles.
 * Enables multi-user access to a team's resources.
 */
export const teamMembers = pgTable('team_members', {
  id: serial('id').primaryKey(),
  teamUuid: uuid('team_uuid').notNull(),
  userUuid: uuid('user_uuid').notNull(),
  role: varchar('role', { length: 50 }).notNull().default('member'), // owner, admin, member
  joinedAt: timestamp('joined_at').defaultNow().notNull(),
}, (table) => [
  index('idx_team_members_team_uuid').on(table.teamUuid),
  index('idx_team_members_user_uuid').on(table.userUuid),
]);

export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type TeamMember = typeof teamMembers.$inferSelect;
