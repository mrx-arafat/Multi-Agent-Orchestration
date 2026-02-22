/**
 * Agent RBAC service — fine-grained permissions for agents.
 * Implements role-based access control with capability-level permissions.
 */
import { eq, and, desc } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import {
  agentPermissions,
  agentPermissionLogs,
  type NewAgentPermission,
  type NewAgentPermissionLog,
} from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

type AgentRole = 'researcher' | 'executor' | 'deployer' | 'auditor' | 'admin';

// Role capability matrix
const ROLE_CAPABILITIES: Record<AgentRole, {
  canRead: boolean;
  canWrite: boolean;
  canExecute: boolean;
  canDeploy: boolean;
  canAudit: boolean;
  canAdmin: boolean;
}> = {
  researcher: { canRead: true, canWrite: false, canExecute: false, canDeploy: false, canAudit: false, canAdmin: false },
  executor: { canRead: true, canWrite: true, canExecute: true, canDeploy: false, canAudit: false, canAdmin: false },
  deployer: { canRead: true, canWrite: true, canExecute: true, canDeploy: true, canAudit: false, canAdmin: false },
  auditor: { canRead: true, canWrite: false, canExecute: false, canDeploy: false, canAudit: true, canAdmin: false },
  admin: { canRead: true, canWrite: true, canExecute: true, canDeploy: true, canAudit: true, canAdmin: true },
};

export interface GrantPermissionParams {
  agentUuid: string;
  role: AgentRole;
  allowedCapabilities?: string[] | undefined;
  deniedCapabilities?: string[] | undefined;
  allowedResources?: Record<string, unknown> | undefined;
  deniedResources?: Record<string, unknown> | undefined;
  canCallExternalApis?: boolean | undefined;
  canAccessProduction?: boolean | undefined;
  canModifyData?: boolean | undefined;
  canDelegateToAgents?: boolean | undefined;
  description?: string | undefined;
  grantedByUserUuid: string;
  teamUuid?: string | undefined;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason: string;
  role: AgentRole;
  agentUuid: string;
}

/**
 * Grant permissions to an agent (creates or updates).
 */
export async function grantPermission(
  db: Database,
  params: GrantPermissionParams,
): Promise<typeof agentPermissions.$inferSelect> {
  // Check if agent already has permissions
  const [existing] = await db.select().from(agentPermissions)
    .where(eq(agentPermissions.agentUuid, params.agentUuid))
    .limit(1);

  if (existing) {
    // Update existing
    const [updated] = await db.update(agentPermissions)
      .set({
        role: params.role,
        allowedCapabilities: params.allowedCapabilities ?? existing.allowedCapabilities,
        deniedCapabilities: params.deniedCapabilities ?? existing.deniedCapabilities,
        allowedResources: params.allowedResources ?? existing.allowedResources,
        deniedResources: params.deniedResources ?? existing.deniedResources,
        canCallExternalApis: params.canCallExternalApis ?? existing.canCallExternalApis,
        canAccessProduction: params.canAccessProduction ?? existing.canAccessProduction,
        canModifyData: params.canModifyData ?? existing.canModifyData,
        canDelegateToAgents: params.canDelegateToAgents ?? existing.canDelegateToAgents,
        description: params.description ?? existing.description,
        updatedAt: new Date(),
      })
      .where(eq(agentPermissions.id, existing.id))
      .returning();

    // Log the change
    await logPermissionEvent(db, {
      agentUuid: params.agentUuid,
      action: 'granted',
      allowed: true,
      reason: `Role updated to ${params.role}`,
      checkedByUserUuid: params.grantedByUserUuid,
      teamUuid: params.teamUuid,
    });

    return updated!;
  }

  const values: NewAgentPermission = {
    agentUuid: params.agentUuid,
    role: params.role,
    allowedCapabilities: params.allowedCapabilities ?? [],
    deniedCapabilities: params.deniedCapabilities ?? [],
    allowedResources: params.allowedResources ?? null,
    deniedResources: params.deniedResources ?? null,
    canCallExternalApis: params.canCallExternalApis ?? true,
    canAccessProduction: params.canAccessProduction ?? false,
    canModifyData: params.canModifyData ?? true,
    canDelegateToAgents: params.canDelegateToAgents ?? false,
    description: params.description,
    grantedByUserUuid: params.grantedByUserUuid,
    teamUuid: params.teamUuid,
  };

  const [permission] = await db.insert(agentPermissions).values(values).returning();
  if (!permission) throw ApiError.internal('Failed to grant permission');

  await logPermissionEvent(db, {
    agentUuid: params.agentUuid,
    action: 'granted',
    allowed: true,
    reason: `Role ${params.role} granted`,
    checkedByUserUuid: params.grantedByUserUuid,
    teamUuid: params.teamUuid,
  });

  return permission;
}

/**
 * Check if an agent has permission for a specific capability.
 */
export async function checkPermission(
  db: Database,
  agentUuid: string,
  capability: string,
  resource?: string,
): Promise<PermissionCheckResult> {
  const [permission] = await db.select().from(agentPermissions)
    .where(eq(agentPermissions.agentUuid, agentUuid))
    .limit(1);

  // No permission record = default executor role (backward compatible)
  if (!permission) {
    return { allowed: true, reason: 'No permission restrictions set', role: 'executor', agentUuid };
  }

  const role = permission.role as AgentRole;
  const rolePerms = ROLE_CAPABILITIES[role];

  // Check denied capabilities first (deny takes precedence)
  if (permission.deniedCapabilities && permission.deniedCapabilities.includes(capability)) {
    await logPermissionEvent(db, {
      agentUuid,
      action: 'denied',
      capability,
      resource: resource ?? undefined,
      allowed: false,
      reason: `Capability ${capability} is in denied list`,
    });
    return { allowed: false, reason: `Capability '${capability}' is denied for this agent`, role, agentUuid };
  }

  // Check allowed capabilities (if set, only listed capabilities are allowed)
  if (permission.allowedCapabilities && permission.allowedCapabilities.length > 0) {
    if (!permission.allowedCapabilities.includes(capability)) {
      await logPermissionEvent(db, {
        agentUuid,
        action: 'denied',
        capability,
        allowed: false,
        reason: `Capability ${capability} not in allowed list`,
      });
      return { allowed: false, reason: `Capability '${capability}' is not in allowed list`, role, agentUuid };
    }
  }

  // Check resource ACLs
  if (resource && permission.deniedResources) {
    const denied = permission.deniedResources as Record<string, string[]>;
    for (const [, resources] of Object.entries(denied)) {
      if (Array.isArray(resources) && resources.includes(resource)) {
        await logPermissionEvent(db, {
          agentUuid,
          action: 'denied',
          capability,
          resource,
          allowed: false,
          reason: `Resource ${resource} is in denied list`,
        });
        return { allowed: false, reason: `Resource '${resource}' is denied for this agent`, role, agentUuid };
      }
    }
  }

  // Role-based check
  if (!rolePerms.canExecute && capability.includes('execute')) {
    return { allowed: false, reason: `Role '${role}' cannot execute tasks`, role, agentUuid };
  }

  await logPermissionEvent(db, {
    agentUuid,
    action: 'checked',
    capability,
    resource: resource ?? undefined,
    allowed: true,
    reason: 'Permission granted',
  });

  return { allowed: true, reason: 'Permission granted', role, agentUuid };
}

/**
 * Get permissions for an agent.
 */
export async function getAgentPermission(
  db: Database,
  agentUuid: string,
): Promise<typeof agentPermissions.$inferSelect | null> {
  const [permission] = await db.select().from(agentPermissions)
    .where(eq(agentPermissions.agentUuid, agentUuid))
    .limit(1);

  return permission ?? null;
}

/**
 * Revoke permissions for an agent.
 */
export async function revokePermission(
  db: Database,
  agentUuid: string,
  revokedByUserUuid: string,
): Promise<void> {
  const result = await db.delete(agentPermissions)
    .where(eq(agentPermissions.agentUuid, agentUuid))
    .returning();

  if (result.length === 0) throw ApiError.notFound('Permission');

  await logPermissionEvent(db, {
    agentUuid,
    action: 'revoked',
    allowed: false,
    reason: 'All permissions revoked',
    checkedByUserUuid: revokedByUserUuid,
  });
}

/**
 * Get permission audit log for an agent.
 */
export async function getPermissionLogs(
  db: Database,
  agentUuid: string,
  limit: number = 50,
): Promise<typeof agentPermissionLogs.$inferSelect[]> {
  return db.select().from(agentPermissionLogs)
    .where(eq(agentPermissionLogs.agentUuid, agentUuid))
    .orderBy(desc(agentPermissionLogs.createdAt))
    .limit(limit);
}

/**
 * Log a permission event.
 */
async function logPermissionEvent(
  db: Database,
  params: {
    agentUuid: string;
    action: string;
    capability?: string | undefined;
    resource?: string | undefined;
    allowed: boolean;
    reason: string;
    checkedByUserUuid?: string | undefined;
    teamUuid?: string | undefined;
  },
): Promise<void> {
  await db.insert(agentPermissionLogs).values({
    agentUuid: params.agentUuid,
    action: params.action,
    capability: params.capability,
    resource: params.resource,
    allowed: params.allowed,
    reason: params.reason,
    checkedByUserUuid: params.checkedByUserUuid,
    teamUuid: params.teamUuid,
  }).catch(() => {}); // Best-effort logging
}
