/**
 * Audit trail routes.
 * GET /workflows/:runId/audit — returns chronological execution trace
 * GET /workflows/:runId/audit/verify — verifies cryptographic signatures (FR-5.2)
 */
import type { FastifyInstance } from 'fastify';
import { getAuditTrail, verifyAuditTrail } from './service.js';

const auditRouteSchema = {
  params: {
    type: 'object',
    required: ['runId'],
    properties: {
      runId: { type: 'string', minLength: 1 },
    },
  },
} as const;

export async function auditRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /workflows/:runId/audit
   * Returns all audit log entries for a workflow run.
   * Protected by JWT auth. Only accessible by workflow owner.
   */
  app.get(
    '/workflows/:runId/audit',
    { schema: auditRouteSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const result = await getAuditTrail(app.db, runId, request.user.sub, request.user.role);
      return reply.send({ success: true, data: result });
    },
  );

  /**
   * GET /workflows/:runId/audit/verify
   * Verifies all cryptographic signatures in the audit trail.
   * Returns verification summary: total, valid, invalid, unsigned counts.
   */
  app.get(
    '/workflows/:runId/audit/verify',
    { schema: auditRouteSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { runId } = request.params as { runId: string };
      const result = await verifyAuditTrail(app.db, runId, request.user.sub, request.user.role);
      return reply.send({ success: true, data: result });
    },
  );
}
