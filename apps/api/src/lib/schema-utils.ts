/**
 * Shared JSON Schema fragments for Fastify route validation.
 * Eliminates duplication of common parameter/query patterns across modules.
 */

// ── UUID Parameter Schemas ────────────────────────────────────────────────

/** Single UUID param — e.g. /agents/:uuid */
export const uuidParam = {
  type: 'object',
  required: ['uuid'],
  properties: { uuid: { type: 'string', format: 'uuid' } },
} as const;

/** Team UUID param — e.g. /teams/:teamUuid/... */
export const teamUuidParam = {
  type: 'object',
  required: ['teamUuid'],
  properties: { teamUuid: { type: 'string', format: 'uuid' } },
} as const;

/** Team + resource UUID params — e.g. /teams/:teamUuid/tasks/:taskUuid */
export function teamResourceParam(resourceKey: string) {
  return {
    type: 'object',
    required: ['teamUuid', resourceKey],
    properties: {
      teamUuid: { type: 'string', format: 'uuid' },
      [resourceKey]: { type: 'string', format: 'uuid' },
    },
  } as const;
}

// ── Query Schemas ─────────────────────────────────────────────────────────

/** Date range query — ?dateStart=YYYY-MM-DD&dateEnd=YYYY-MM-DD */
export const dateRangeQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    dateStart: { type: 'string', format: 'date' },
    dateEnd: { type: 'string', format: 'date' },
  },
} as const;

/** Pagination query — ?page=1&limit=20 */
export const paginationQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    page: { type: 'integer', minimum: 1, default: 1 },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
} as const;

/** Pagination + date range query */
export const paginatedDateRangeQuery = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ...paginationQuery.properties,
    ...dateRangeQuery.properties,
  },
} as const;
