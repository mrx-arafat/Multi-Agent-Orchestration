import type { FastifyInstance } from 'fastify';
import type { ApiResponse } from '@maof/shared';

interface HealthData {
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  services: {
    database: 'connected' | 'disconnected';
    redis: 'connected' | 'disconnected';
  };
}

/**
 * Health check route.
 * Verifies database and Redis connectivity.
 * Returns 200 if all services are connected, 503 if any service is down.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: ApiResponse<HealthData> }>(
    '/health',
    {
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['ok', 'degraded'] },
                  timestamp: { type: 'string' },
                  version: { type: 'string' },
                  services: {
                    type: 'object',
                    properties: {
                      database: { type: 'string', enum: ['connected', 'disconnected'] },
                      redis: { type: 'string', enum: ['connected', 'disconnected'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request, reply) => {
      let dbStatus: 'connected' | 'disconnected' = 'disconnected';
      let redisStatus: 'connected' | 'disconnected' = 'disconnected';

      // Check database connectivity
      try {
        if (app.db) {
          const { sql } = await import('drizzle-orm');
          await app.db.execute(sql`SELECT 1`);
          dbStatus = 'connected';
        }
      } catch (_err) {
        app.log.warn('Health check: database connection failed');
      }

      // Check Redis connectivity
      try {
        if (app.redis) {
          await app.redis.ping();
          redisStatus = 'connected';
        }
      } catch (_err) {
        app.log.warn('Health check: Redis connection failed');
      }

      const allHealthy = dbStatus === 'connected' && redisStatus === 'connected';
      const status = allHealthy ? 'ok' : 'degraded';
      const httpStatus = allHealthy ? 200 : 503;

      return reply.status(httpStatus).send({
        success: allHealthy,
        data: {
          status,
          timestamp: new Date().toISOString(),
          version: '0.1.0',
          services: {
            database: dbStatus,
            redis: redisStatus,
          },
        },
      });
    },
  );
}
