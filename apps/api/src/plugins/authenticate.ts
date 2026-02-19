/**
 * JWT + API token authentication plugin.
 * Registers @fastify/jwt with the app and decorates the instance
 * with `app.authenticate` — a preHandler that verifies Bearer tokens
 * (JWT or API token) and sets `request.user` with the decoded payload.
 *
 * Phase 2: Dual auth — accepts both JWT access tokens and API tokens (maof_*).
 */
import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getConfig } from '../config/index.js';
import { validateApiToken } from '../modules/auth/api-token-service.js';

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
    requireRole: (role: string) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

// Override @fastify/jwt user type with our payload shape
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

const API_TOKEN_PREFIX = 'maof_';

export const authenticatePlugin = fp(async function (app: FastifyInstance): Promise<void> {
  const config = getConfig();

  await app.register(jwt, {
    secret: config.MAOF_JWT_SECRET,
    sign: {
      expiresIn: config.MAOF_JWT_ACCESS_EXPIRES_IN,
    },
  });

  // Decorate with authenticate preHandler (dual: JWT + API token)
  app.decorate('authenticate', async function (request: FastifyRequest, reply: FastifyReply) {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    // API token auth (maof_* prefix)
    if (token.startsWith(API_TOKEN_PREFIX)) {
      const result = await validateApiToken(app.db, token);
      if (!result) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Invalid or expired API token' },
        });
      }

      // Set request.user to match JWT payload shape for compatibility
      (request as unknown as { user: JwtPayload }).user = {
        sub: result.userUuid,
        email: result.email,
        role: result.role,
        type: 'access', // API tokens always act as access tokens
      };
      return;
    }

    // JWT auth (default)
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

  // Role-based access control preHandler factory
  app.decorate('requireRole', function (role: string) {
    return async function (request: FastifyRequest, reply: FastifyReply): Promise<void> {
      // authenticate must run first to populate request.user
      if (!request.user?.role) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
        });
      }

      // Admin role bypasses all role checks
      if (request.user.role === 'admin') return;

      if (request.user.role !== role) {
        return reply.status(403).send({
          success: false,
          error: { code: 'FORBIDDEN', message: `Requires '${role}' role` },
        });
      }
    };
  });
});
