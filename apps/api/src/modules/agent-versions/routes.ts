import type { FastifyInstance } from 'fastify';
import {
  createVersionSchema,
  promoteVersionSchema,
  rollbackSchema,
  listVersionsSchema,
  getVersionSchema,
} from './schemas.js';
import {
  createVersion,
  promoteVersion,
  rollbackVersion,
  listVersions,
  getVersion,
} from './service.js';

export async function agentVersionRoutes(app: FastifyInstance): Promise<void> {
  // Create a new version for an agent
  app.post(
    '/agents/:agentUuid/versions',
    { schema: createVersionSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const body = request.body as {
        version: string;
        endpoint: string;
        capabilities?: string[];
        config?: Record<string, unknown>;
        deploymentStrategy?: 'direct' | 'canary' | 'blue_green';
        errorThreshold?: number;
        releaseNotes?: string;
      };

      const version = await createVersion(app.db, {
        agentUuid,
        ...body,
        createdByUserUuid: request.user.sub,
      });

      return reply.status(201).send({ success: true, data: version });
    },
  );

  // Promote a version (deploy)
  app.post(
    '/versions/:versionUuid/promote',
    { schema: promoteVersionSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { versionUuid } = request.params as { versionUuid: string };
      const { strategy, trafficPercent } = request.body as {
        strategy: 'direct' | 'canary' | 'blue_green';
        trafficPercent?: number;
      };

      const version = await promoteVersion(app.db, {
        versionUuid,
        strategy,
        trafficPercent,
      });

      return reply.send({ success: true, data: version });
    },
  );

  // Rollback to last known-good version
  app.post(
    '/agents/:agentUuid/rollback',
    { schema: rollbackSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const version = await rollbackVersion(app.db, agentUuid);
      return reply.send({ success: true, data: version });
    },
  );

  // List all versions for an agent
  app.get(
    '/agents/:agentUuid/versions',
    { schema: listVersionsSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { agentUuid } = request.params as { agentUuid: string };
      const versions = await listVersions(app.db, agentUuid);
      return reply.send({ success: true, data: { versions, count: versions.length } });
    },
  );

  // Get a specific version
  app.get(
    '/versions/:versionUuid',
    { schema: getVersionSchema, preHandler: [app.authenticate] },
    async (request, reply) => {
      const { versionUuid } = request.params as { versionUuid: string };
      const version = await getVersion(app.db, versionUuid);
      return reply.send({ success: true, data: version });
    },
  );
}
