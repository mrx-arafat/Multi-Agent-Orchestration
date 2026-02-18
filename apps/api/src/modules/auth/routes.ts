/**
 * Auth routes module.
 * POST /auth/register  — create account
 * POST /auth/login     — get token pair
 * POST /auth/refresh   — rotate token pair
 * GET  /auth/me        — current user (requires Bearer token)
 */
import type { FastifyInstance } from 'fastify';
import { getConfig } from '../../config/index.js';
import { registerUser, validateCredentials, getUserByUuid } from './service.js';
import { registerSchema, loginSchema, refreshSchema } from './schemas.js';
import type { JwtPayload } from '../../plugins/authenticate.js';
import { ApiError } from '../../types/index.js';

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
}
