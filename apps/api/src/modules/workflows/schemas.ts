/**
 * Workflow module — JSON Schema for Fastify/AJV validation.
 */

const stageSchema = {
  type: 'object',
  required: ['id', 'name', 'agentCapability'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', minLength: 1, maxLength: 255 },
    name: { type: 'string', minLength: 1, maxLength: 255 },
    agentCapability: { type: 'string', minLength: 1 },
    input: { type: 'object' },
    dependencies: {
      type: 'array',
      items: { type: 'string' },
      default: [],
    },
    config: { type: 'object' },
    retryConfig: {
      type: 'object',
      additionalProperties: false,
      properties: {
        maxRetries: { type: 'integer', minimum: 0, maximum: 10, default: 2 },
        backoffMs: { type: 'integer', minimum: 100, maximum: 60000, default: 1000 },
        timeoutMs: { type: 'integer', minimum: 1000, maximum: 300000 },
      },
    },
  },
} as const;

const workflowDefinitionSchema = {
  type: 'object',
  required: ['name', 'stages'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 255 },
    stages: {
      type: 'array',
      minItems: 1,
      maxItems: 100,
      items: stageSchema,
    },
  },
} as const;

export const executeWorkflowSchema = {
  body: {
    type: 'object',
    required: ['workflow'],
    additionalProperties: false,
    properties: {
      workflow: workflowDefinitionSchema,
      input: { type: 'object', default: {} },
    },
  },
} as const;

export const workflowRunIdParamSchema = {
  params: {
    type: 'object',
    required: ['runId'],
    properties: {
      runId: { type: 'string', minLength: 1 },
    },
  },
} as const;

export const listWorkflowsSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: ['queued', 'in_progress', 'completed', 'failed'] },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    },
  },
} as const;
