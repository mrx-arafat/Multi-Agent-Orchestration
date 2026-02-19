/**
 * Memory store module — JSON Schema for Fastify/AJV validation.
 */

export const writeMemorySchema = {
  params: {
    type: 'object',
    required: ['workflowRunId'],
    properties: {
      workflowRunId: { type: 'string', minLength: 1 },
    },
  },
  body: {
    type: 'object',
    required: ['key', 'value'],
    additionalProperties: false,
    properties: {
      key: { type: 'string', minLength: 1, maxLength: 255 },
      value: {},
      ttlSeconds: { type: 'integer', minimum: 1, maximum: 604800 },
    },
  },
} as const;

export const readMemorySchema = {
  params: {
    type: 'object',
    required: ['workflowRunId', 'key'],
    properties: {
      workflowRunId: { type: 'string', minLength: 1 },
      key: { type: 'string', minLength: 1 },
    },
  },
} as const;

export const listMemorySchema = {
  params: {
    type: 'object',
    required: ['workflowRunId'],
    properties: {
      workflowRunId: { type: 'string', minLength: 1 },
    },
  },
} as const;
