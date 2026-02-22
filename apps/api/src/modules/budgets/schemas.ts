export const createBudgetSchema = {
  body: {
    type: 'object',
    required: ['name', 'scope', 'scopeUuid', 'maxCostCents'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 255 },
      scope: { type: 'string', enum: ['agent', 'workflow', 'team'] },
      scopeUuid: { type: 'string', format: 'uuid' },
      maxCostCents: { type: 'integer', minimum: 1 },
      alertThresholdPercent: { type: 'integer', minimum: 1, maximum: 100, default: 80 },
      actionAtLimit: { type: 'string', enum: ['pause', 'notify', 'kill'], default: 'pause' },
      period: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'total'], default: 'monthly' },
    },
  },
} as const;

export const checkBudgetSchema = {
  querystring: {
    type: 'object',
    required: ['scope', 'scopeUuid'],
    properties: {
      scope: { type: 'string', enum: ['agent', 'workflow', 'team'] },
      scopeUuid: { type: 'string', format: 'uuid' },
      additionalCostCents: { type: 'integer', minimum: 0, default: 0 },
    },
  },
} as const;

export const updateBudgetSchema = {
  params: {
    type: 'object',
    required: ['budgetUuid'],
    properties: {
      budgetUuid: { type: 'string', format: 'uuid' },
    },
  },
  body: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 255 },
      maxCostCents: { type: 'integer', minimum: 1 },
      alertThresholdPercent: { type: 'integer', minimum: 1, maximum: 100 },
      actionAtLimit: { type: 'string', enum: ['pause', 'notify', 'kill'] },
      isActive: { type: 'boolean' },
    },
  },
} as const;

export const deleteBudgetSchema = {
  params: {
    type: 'object',
    required: ['budgetUuid'],
    properties: {
      budgetUuid: { type: 'string', format: 'uuid' },
    },
  },
} as const;

export const listBudgetsSchema = {
  querystring: {
    type: 'object',
    properties: {
      scope: { type: 'string', enum: ['agent', 'workflow', 'team'] },
    },
  },
} as const;
