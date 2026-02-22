/**
 * MAOF API Response Envelope
 * All API responses follow this consistent shape.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
}

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'BAD_REQUEST'
  | 'SERVICE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'WORKFLOW_INVALID'
  | 'AGENT_NOT_FOUND'
  | 'WORKFLOW_NOT_FOUND'
  | 'WORKFLOW_NOT_COMPLETE'
  | 'BUDGET_EXCEEDED'
  | 'RESOURCE_LOCKED'
  | 'PERMISSION_DENIED'
  | 'VERSION_CONFLICT';

export interface PaginationQuery {
  page?: number;
  limit?: number;
}
