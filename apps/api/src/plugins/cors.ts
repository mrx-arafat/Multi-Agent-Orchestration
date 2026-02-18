import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import type { Env } from '../config/index.js';

/**
 * CORS configuration plugin.
 * Allows specified origins (configurable via MAOF_CORS_ORIGINS).
 */
export async function corsPlugin(app: FastifyInstance, env: Env): Promise<void> {
  const allowedOrigins = env.MAOF_CORS_ORIGINS.split(',').map((o) => o.trim());

  await app.register(cors, {
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, Postman, server-to-server)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}
