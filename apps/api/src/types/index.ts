import type { ApiErrorCode } from '@maof/shared';

/**
 * Standard API error thrown within route handlers and services.
 * The error handler plugin maps these to proper HTTP responses.
 */
export class ApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ApiErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static notFound(resource: string): ApiError {
    return new ApiError(404, 'NOT_FOUND', `${resource} not found`);
  }

  static unauthorized(message = 'Unauthorized'): ApiError {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'Forbidden'): ApiError {
    return new ApiError(403, 'FORBIDDEN', message);
  }

  static conflict(message: string): ApiError {
    return new ApiError(409, 'CONFLICT', message);
  }

  static badRequest(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }

  static internal(message = 'Internal server error'): ApiError {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}

/** FastifyRequest user decoration (set by authenticate plugin) */
export interface RequestUser {
  userId: string;
  email: string;
  role: 'admin' | 'user';
}
