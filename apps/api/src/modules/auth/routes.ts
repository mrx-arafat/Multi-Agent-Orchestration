/**
 * Auth routes module.
 * POST /auth/register  — create account
 * POST /auth/login     — get token pair
 * POST /auth/refresh   — rotate token pair
 * GET  /auth/me        — current user (requires Bearer token)
 */
import type { FastifyInstance } from 'fastify';
import { getConfig } from '../../config/index.js';
import { registerUser, validateCredentials, getUserByUuid, updateUserProfile } from './service.js';
import { registerSchema, loginSchema, refreshSchema } from './schemas.js';
import type { JwtPayload } from '../../plugins/authenticate.js';
import { ApiError } from '../../types/index.js';
import { createApiToken, listApiTokens, revokeApiToken } from './api-token-service.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  const config = getConfig();

  /**
   * POST /auth/register
   * Body: { email, password, name }
   * Returns 201 + user (no tokens — user must login)
   */
  app.post('/auth/register', { schema: registerSchema }, async (request, reply) => {
    const { email, password, name } = request.body as {
      email: string;
      password: string;
      name: string;
    };

    const user = await registerUser(app.db, email, password, name);

    return reply.status(201).send({ success: true, data: user });
  });

  /**
   * POST /auth/login
   * Body: { email, password }
   * Returns 200 + { accessToken, refreshToken, user }
   */
  app.post('/auth/login', { schema: loginSchema }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const user = await validateCredentials(app.db, email, password);

    const payload: Omit<JwtPayload, 'type'> = {
      sub: user.userUuid,
      email: user.email,
      role: user.role,
    };

    const accessToken = app.jwt.sign(
      { ...payload, type: 'access' },
      { expiresIn: config.MAOF_JWT_ACCESS_EXPIRES_IN },
    );

    const refreshToken = app.jwt.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: config.MAOF_JWT_REFRESH_EXPIRES_IN },
    );

    return reply.send({
      success: true,
      data: { accessToken, refreshToken, user },
    });
  });

  /**
   * POST /auth/refresh
   * Body: { refreshToken }
   * Returns 200 + { accessToken, refreshToken }
   */
  app.post('/auth/refresh', { schema: refreshSchema }, async (request, reply) => {
    const { refreshToken } = request.body as { refreshToken: string };

    let decoded: JwtPayload;
    try {
      decoded = app.jwt.verify<JwtPayload>(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    if (decoded.type !== 'refresh') {
      throw ApiError.unauthorized('Invalid token type');
    }

    // Re-fetch user from DB to get current email/role (not stale token data)
    const currentUser = await getUserByUuid(app.db, decoded.sub);

    const payload: Omit<JwtPayload, 'type'> = {
      sub: currentUser.userUuid,
      email: currentUser.email,
      role: currentUser.role,
    };

    const newAccessToken = app.jwt.sign(
      { ...payload, type: 'access' },
      { expiresIn: config.MAOF_JWT_ACCESS_EXPIRES_IN },
    );
    const newRefreshToken = app.jwt.sign(
      { ...payload, type: 'refresh' },
      { expiresIn: config.MAOF_JWT_REFRESH_EXPIRES_IN },
    );

    return reply.send({
      success: true,
      data: { accessToken: newAccessToken, refreshToken: newRefreshToken },
    });
  });

  /**
   * GET /auth/me
   * Returns current user. Requires valid Bearer access token.
   */
  app.get('/auth/me', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = await getUserByUuid(app.db, request.user.sub);
    return reply.send({ success: true, data: user });
  });

  /**
   * PATCH /auth/profile
   * Body: { name }
   * Updates the authenticated user's profile.
   */
  app.patch(
    '/auth/profile',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { name } = request.body as { name: string };
      const user = await updateUserProfile(app.db, request.user.sub, { name });
      return reply.send({ success: true, data: user });
    },
  );

  // ── API Token Management (Phase 2) ────────────────────────────────────

  /**
   * POST /auth/api-tokens
   * Body: { name, scopes?, expiresInDays? }
   * Returns 201 + { token (plaintext, shown once), metadata }
   */
  app.post(
    '/auth/api-tokens',
    {
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 255 },
            scopes: { type: 'array', items: { type: 'string' }, default: [] },
            expiresInDays: { type: 'integer', minimum: 1, maximum: 365 },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { name, scopes, expiresInDays } = request.body as {
        name: string;
        scopes?: string[];
        expiresInDays?: number;
      };

      let expiresAt: Date | undefined;
      if (expiresInDays) {
        expiresAt = new Date(Date.now() + expiresInDays * 86400000);
      }

      const result = await createApiToken(app.db, {
        userUuid: request.user.sub,
        name,
        ...(scopes ? { scopes } : {}),
        ...(expiresAt ? { expiresAt } : {}),
      });

      return reply.status(201).send({ success: true, data: result });
    },
  );

  /**
   * GET /auth/api-tokens
   * Returns all API tokens for the authenticated user (no plaintext).
   */
  app.get(
    '/auth/api-tokens',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const tokens = await listApiTokens(app.db, request.user.sub);
      return reply.send({ success: true, data: tokens });
    },
  );

  /**
   * DELETE /auth/api-tokens/:tokenId
   * Revokes an API token. Only the owning user can revoke.
   */
  app.delete(
    '/auth/api-tokens/:tokenId',
    {
      schema: {
        params: {
          type: 'object',
          required: ['tokenId'],
          properties: {
            tokenId: { type: 'string', format: 'uuid' },
          },
        },
      },
      preHandler: [app.authenticate],
    },
    async (request, reply) => {
      const { tokenId } = request.params as { tokenId: string };
      await revokeApiToken(app.db, tokenId, request.user.sub);
      return reply.send({ success: true, data: { revoked: true } });
    },
  );
}
