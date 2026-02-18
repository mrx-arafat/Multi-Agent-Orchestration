import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';
import type { ApiResponse } from '@maof/shared';
import { ApiError } from '../types/index.js';

/**
 * Global error handler plugin.
 * Maps ApiError, Fastify validation errors, and unknown errors to
 * consistent JSON envelopes.
 *
 * Wrapped with fp() so the error handler leaks to the root scope and
 * applies to ALL routes, not just routes within this plugin's scope.
 */
export const errorHandlerPlugin = fp(async function (app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error, request, reply) => {
    const log = request.log;

    // Our custom domain errors
    if (error instanceof ApiError) {
      log.warn({ code: error.code, path: request.url }, error.message);
      const body: ApiResponse = {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      };
      return reply.status(error.statusCode).send(body);
    }

    const fastifyError = error as { validation?: unknown; name?: string; statusCode?: number };

    // Fastify schema validation errors (400)
    if (fastifyError.validation) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: { errors: fastifyError.validation },
        },
      };
      return reply.status(400).send(body);
    }

    // JWT errors
    if (fastifyError.name === 'UnauthorizedError' || fastifyError.statusCode === 401) {
      const body: ApiResponse = {
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
      };
      return reply.status(401).send(body);
    }

    // Fastify built-in errors (e.g., FST_ERR_CTP_INVALID_JSON_BODY) — preserve status code
    if (fastifyError.statusCode && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'BAD_REQUEST',
          message: (error as Error).message || 'Bad request',
        },
      };
      return reply.status(fastifyError.statusCode).send(body);
    }

    // Unknown errors — log full error, return generic 500
    log.error({ err: error, path: request.url }, 'Unhandled error');
    const body: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    };
    return reply.status(500).send(body);
  });

  // 404 handler for unmatched routes
  app.setNotFoundHandler((request, reply) => {
    const body: ApiResponse = {
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    };
    return reply.status(404).send(body);
  });
});
