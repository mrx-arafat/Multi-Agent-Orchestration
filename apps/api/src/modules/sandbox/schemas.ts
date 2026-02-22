export const dryRunSchema = {
  body: {
    type: 'object',
    required: ['workflow'],
    properties: {
      workflow: {
        type: 'object',
        required: ['name', 'stages'],
        properties: {
          name: { type: 'string', minLength: 1 },
          stages: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['id', 'agentCapability'],
              properties: {
                id: { type: 'string' },
                agentCapability: { type: 'string' },
                input: { type: 'object' },
                dependencies: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      input: { type: 'object' },
    },
  },
} as const;

export const shadowRunSchema = {
  body: {
    type: 'object',
    required: ['workflowRunId', 'workflow'],
    properties: {
      workflowRunId: { type: 'string', minLength: 1 },
      workflow: {
        type: 'object',
        required: ['name', 'stages'],
        properties: {
          name: { type: 'string', minLength: 1 },
          stages: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              required: ['id', 'agentCapability'],
              properties: {
                id: { type: 'string' },
                agentCapability: { type: 'string' },
                input: { type: 'object' },
                dependencies: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
      input: { type: 'object' },
    },
  },
} as const;

export const getSandboxRunSchema = {
  params: {
    type: 'object',
    required: ['sandboxUuid'],
    properties: {
      sandboxUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export const listSandboxRunsSchema = {
  querystring: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['dry_run', 'shadow', 'isolated'] },
    },
  },
} as const;
