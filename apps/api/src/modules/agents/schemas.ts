/**
 * Agent module — JSON Schema for Fastify/AJV validation.
 */

export const registerAgentSchema = {
  body: {
    type: 'object',
    required: ['agentId', 'name', 'endpoint', 'authToken'],
    additionalProperties: false,
    properties: {
      agentId: { type: 'string', minLength: 1, maxLength: 255 },
      name: { type: 'string', minLength: 1, maxLength: 255 },
      description: { type: 'string', maxLength: 2048 },
      endpoint: { type: 'string', format: 'uri', maxLength: 2048 },
      authToken: { type: 'string', minLength: 1, maxLength: 1024 },
      capabilities: {
        type: 'array',
        items: { type: 'string', minLength: 1 },
        default: [],
      },
      maxConcurrentTasks: { type: 'integer', minimum: 1, maximum: 100, default: 5 },
      agentType: { type: 'string', enum: ['generic', 'openclaw'], default: 'generic' },
      teamUuid: { type: 'string', format: 'uuid' },
      createTeam: { type: 'boolean', default: false },
      teamName: { type: 'string', minLength: 1, maxLength: 255 },
    },
  },
} as const;

export const listAgentsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      capability: { type: 'string' },
      status: { type: 'string', enum: ['online', 'degraded', 'offline'] },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
} as const;

export const agentUuidParamSchema = {
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;
