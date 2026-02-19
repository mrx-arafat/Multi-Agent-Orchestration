/**
 * Agent activity service (SRS FR-5.3).
 * Returns an agent's execution history from the audit trail.
 * Supports date range filtering, status filtering, and pagination.
 */
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import type { Database } from '../../db/index.js';
import { executionLogs } from '../../db/schema/index.js';
import { agents } from '../../db/schema/index.js';
import { ApiError } from '../../types/index.js';

export interface AgentActivityEntry {
  id: number;
  workflowRunId: string;
  stageId: string;
  action: string;
  status: string;
  loggedAt: Date;
}

export interface AgentActivityResult {
  agentUuid: string;
  agentId: string;
  activity: AgentActivityEntry[];
  meta: { total: number; page: number; limit: number; pages: number };
}

export async function getAgentActivity(
  db: Database,
  agentUuid: string,
  params: {
    status?: string;
    dateStart?: string;
    dateEnd?: string;
    page?: number;
    limit?: number;
  },
): Promise<AgentActivityResult> {
  // Verify agent exists and get agentId
  const [agent] = await db
    .select({ agentUuid: agents.agentUuid, agentId: agents.agentId })
    .from(agents)
    .where(eq(agents.agentUuid, agentUuid))
    .limit(1);

  if (!agent) {
    throw ApiError.notFound('Agent');
  }

  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const offset = (page - 1) * limit;

  // Build conditions — execution logs use agentId (string), not agentUuid
  const conditions = [eq(executionLogs.agentId, agent.agentId)];

  if (params.status) {
    conditions.push(eq(executionLogs.status, params.status));
  }
  if (params.dateStart) {
    conditions.push(gte(executionLogs.loggedAt, new Date(params.dateStart)));
  }
  if (params.dateEnd) {
    // Include the entire end day
    const endDate = new Date(params.dateEnd);
    endDate.setDate(endDate.getDate() + 1);
    conditions.push(lte(executionLogs.loggedAt, endDate));
  }

  const whereClause = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db
      .select({
        id: executionLogs.id,
        workflowRunId: executionLogs.workflowRunId,
        stageId: executionLogs.stageId,
        action: executionLogs.action,
        status: executionLogs.status,
        loggedAt: executionLogs.loggedAt,
      })
      .from(executionLogs)
      .where(whereClause)
      .orderBy(desc(executionLogs.loggedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(executionLogs)
      .where(whereClause),
  ]);

  const total = countResult[0]?.count ?? 0;

  return {
    agentUuid: agent.agentUuid,
    agentId: agent.agentId,
    activity: rows,
    meta: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  };
}
