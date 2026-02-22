import {
  pgTable,
  serial,
  uuid,
  varchar,
  text,
  boolean,
  jsonb,
  pgEnum,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const agentRoleEnum = pgEnum('agent_role', [
  'researcher',  // Read-only, can search and analyze
  'executor',    // Can execute tasks and call APIs
  'deployer',    // Production access, can deploy
  'auditor',     // Read everything, can audit
  'admin',       // Full agent access
]);

/**
 * Agent permissions table — fine-grained RBAC for agents.
 * Controls what agents can do and access.
 */
export const agentPermissions = pgTable('agent_permissions', {
  id: serial('id').primaryKey(),
  permissionUuid: uuid('permission_uuid').defaultRandom().notNull().unique(),
  agentUuid: uuid('agent_uuid').notNull(),
  role: agentRoleEnum('agent_role').notNull().default('executor'),
  // Capability-level permissions (JSON array of allowed actions)
  allowedCapabilities: text('allowed_capabilities').array().default([]),
  deniedCapabilities: text('denied_capabilities').array().default([]),
  // Resource ACLs
  allowedResources: jsonb('allowed_resources'), // { repos: [...], apis: [...] }
  deniedResources: jsonb('denied_resources'),
  // Operational limits
  canCallExternalApis: boolean('can_call_external_apis').notNull().default(true),
  canAccessProduction: boolean('can_access_production').notNull().default(false),
  canModifyData: boolean('can_modify_data').notNull().default(true),
  canDelegateToAgents: boolean('can_delegate_to_agents').notNull().default(false),
  maxConcurrentOps: varchar('max_concurrent_ops', { length: 10 }),
  description: text('description'),
  grantedByUserUuid: uuid('granted_by_user_uuid').notNull(),
  teamUuid: uuid('team_uuid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('idx_agent_permissions_agent_uuid').on(table.agentUuid),
  index('idx_agent_permissions_role').on(table.role),
  index('idx_agent_permissions_team_uuid').on(table.teamUuid),
]);

/**
 * Agent permission audit log — tracks all permission changes and usage.
 */
export const agentPermissionLogs = pgTable('agent_permission_logs', {
  id: serial('id').primaryKey(),
  logUuid: uuid('log_uuid').defaultRandom().notNull().unique(),
  agentUuid: uuid('agent_uuid').notNull(),
  action: varchar('action', { length: 100 }).notNull(), // 'granted', 'denied', 'checked', 'violated'
  resource: varchar('resource', { length: 500 }),
  capability: varchar('capability', { length: 255 }),
  allowed: boolean('allowed').notNull(),
  reason: text('reason'),
  metadata: jsonb('metadata'),
  checkedByUserUuid: uuid('checked_by_user_uuid'),
  teamUuid: uuid('team_uuid'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('idx_agent_perm_logs_agent_uuid').on(table.agentUuid),
  index('idx_agent_perm_logs_action').on(table.action),
  index('idx_agent_perm_logs_created_at').on(table.createdAt),
]);

export type AgentPermission = typeof agentPermissions.$inferSelect;
export type NewAgentPermission = typeof agentPermissions.$inferInsert;
export type AgentPermissionLog = typeof agentPermissionLogs.$inferSelect;
export type NewAgentPermissionLog = typeof agentPermissionLogs.$inferInsert;
