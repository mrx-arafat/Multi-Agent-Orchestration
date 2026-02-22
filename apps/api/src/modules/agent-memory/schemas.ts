export const storeMemorySchema = {
  body: {
    type: 'object',
    required: ['memoryType', 'title', 'content'],
    properties: {
      memoryType: { type: 'string', enum: ['episodic', 'semantic', 'working'] },
      title: { type: 'string', minLength: 1, maxLength: 500 },
      content: { type: 'string', minLength: 1 },
      category: { type: 'string', maxLength: 255 },
      importance: { type: 'integer', minimum: 1, maximum: 10 },
      metadata: { type: 'object' },
      workflowRunId: { type: 'string' },
      ttlSeconds: { type: 'integer', minimum: 60 },
    },
  },
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export const recallMemorySchema = {
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
  querystring: {
    type: 'object',
    properties: {
      memoryType: { type: 'string', enum: ['episodic', 'semantic', 'working'] },
      category: { type: 'string' },
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
      minImportance: { type: 'integer', minimum: 1, maximum: 10 },
    },
  },
} as const;

export const deleteMemorySchema = {
  params: {
    type: 'object',
    required: ['agentUuid', 'memoryUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
      memoryUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export const memorySummarySchema = {
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;
