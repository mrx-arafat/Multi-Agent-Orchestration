export const createVersionSchema = {
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['version', 'endpoint'],
    properties: {
      version: { type: 'string', minLength: 1, maxLength: 50 },
      endpoint: { type: 'string', format: 'uri' },
      capabilities: { type: 'array', items: { type: 'string' } },
      config: { type: 'object' },
      deploymentStrategy: { type: 'string', enum: ['direct', 'canary', 'blue_green'] },
      errorThreshold: { type: 'integer', minimum: 1, maximum: 1000 },
      releaseNotes: { type: 'string' },
    },
  },
} as const;

export const promoteVersionSchema = {
  params: {
    type: 'object',
    required: ['versionUuid'],
    properties: {
      versionUuid: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['strategy'],
    properties: {
      strategy: { type: 'string', enum: ['direct', 'canary', 'blue_green'] },
      trafficPercent: { type: 'integer', minimum: 1, maximum: 100 },
    },
  },
} as const;

export const rollbackSchema = {
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export const listVersionsSchema = {
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export const getVersionSchema = {
  params: {
    type: 'object',
    required: ['versionUuid'],
    properties: {
      versionUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;
