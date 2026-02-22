export const acquireLockSchema = {
  body: {
    type: 'object',
    required: ['resourceType', 'resourceId', 'ownerAgentUuid'],
    properties: {
      resourceType: { type: 'string', minLength: 1, maxLength: 100 },
      resourceId: { type: 'string', minLength: 1, maxLength: 500 },
      ownerAgentUuid: { type: 'string', format: 'uuid' },
      ownerWorkflowRunId: { type: 'string' },
      conflictStrategy: { type: 'string', enum: ['fail', 'queue', 'merge', 'escalate'] },
      timeoutSeconds: { type: 'integer', minimum: 1, maximum: 3600, default: 30 },
      contentHash: { type: 'string' },
      metadata: { type: 'object' },
    },
  },
} as const;

export const releaseLockSchema = {
  params: {
    type: 'object',
    required: ['lockUuid'],
    properties: {
      lockUuid: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['ownerAgentUuid'],
    properties: {
      ownerAgentUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export const checkLockSchema = {
  querystring: {
    type: 'object',
    required: ['resourceType', 'resourceId'],
    properties: {
      resourceType: { type: 'string' },
      resourceId: { type: 'string' },
    },
  },
} as const;

export const detectConflictSchema = {
  params: {
    type: 'object',
    required: ['lockUuid'],
    properties: {
      lockUuid: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['currentContentHash'],
    properties: {
      currentContentHash: { type: 'string' },
    },
  },
} as const;
