/**
 * JWT authentication plugin.
 * Registers @fastify/jwt with the app and decorates the instance
 * with `app.authenticate` — a preHandler that verifies Bearer tokens
 * and sets `request.user` with the decoded JWT payload.
 */
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '../config/index.js';

export interface JwtPayload {
  sub: string; // userUuid
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

// Augment Fastify types
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Override @fastify/jwt user type with our payload shape
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

export const authenticatePlugin = fp(async function (app: FastifyInstance): Promise<void> {
  const config = getConfig();

  await app.register(jwt, {
    secret: config.MAOF_JWT_SECRET,
    sign: {
      expiresIn: config.MAOF_JWT_ACCESS_EXPIRES_IN,
    },
  });

  // Decorate with authenticate preHandler
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      await request.jwtVerify<JwtPayload>();
      // Only allow access tokens on protected routes
      if (request.user.type !== 'access') {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid token type' },
        });
      }
    } catch {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }
  });
});
