export const getCacheSchema = {
  querystring: {
    type: 'object',
    required: ['capability'],
    properties: {
      capability: { type: 'string' },
      input: { type: 'string' }, // JSON-encoded input
    },
  },
} as const;

export const setCacheSchema = {
  body: {
    type: 'object',
    required: ['capability', 'input', 'output', 'agentId'],
    properties: {
      capability: { type: 'string', minLength: 1 },
      input: { type: 'object' },
      output: { type: 'object' },
      agentId: { type: 'string' },
      ttlSeconds: { type: 'integer', minimum: 60, maximum: 86400, default: 3600 },
    },
  },
} as const;

export const invalidateSchema = {
  body: {
    type: 'object',
    properties: {
      capability: { type: 'string' },
      input: { type: 'object' },
    },
  },
} as const;

export const warmCacheSchema = {
  body: {
    type: 'object',
    required: ['entries'],
    properties: {
      entries: {
        type: 'array',
        minItems: 1,
        maxItems: 100,
        items: {
          type: 'object',
          required: ['capability', 'input', 'output', 'agentId'],
          properties: {
            capability: { type: 'string' },
            input: { type: 'object' },
            output: { type: 'object' },
            agentId: { type: 'string' },
            ttlSeconds: { type: 'integer', minimum: 60 },
          },
        },
      },
    },
  },
} as const;
