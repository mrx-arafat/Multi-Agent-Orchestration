export const grantPermissionSchema = {
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    required: ['role'],
    properties: {
      role: { type: 'string', enum: ['researcher', 'executor', 'deployer', 'auditor', 'admin'] },
      allowedCapabilities: { type: 'array', items: { type: 'string' } },
      deniedCapabilities: { type: 'array', items: { type: 'string' } },
      allowedResources: { type: 'object' },
      deniedResources: { type: 'object' },
      canCallExternalApis: { type: 'boolean' },
      canAccessProduction: { type: 'boolean' },
      canModifyData: { type: 'boolean' },
      canDelegateToAgents: { type: 'boolean' },
      description: { type: 'string' },
    },
  },
} as const;

export const checkPermissionSchema = {
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
  querystring: {
    type: 'object',
    required: ['capability'],
    properties: {
      capability: { type: 'string' },
      resource: { type: 'string' },
    },
  },
} as const;

export const revokePermissionSchema = {
  params: {
    type: 'object',
    required: ['agentUuid'],
    properties: {
      agentUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export const permissionLogsSchema = {
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
      limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
    },
  },
} as const;
