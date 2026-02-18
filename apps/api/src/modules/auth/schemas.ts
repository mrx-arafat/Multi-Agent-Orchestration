/**
 * Auth module — JSON Schema definitions for Fastify validation.
 * Using JSON Schema (not Zod) so Fastify's built-in AJV can validate
 * and generate TypeScript types via @fastify/type-provider-typebox or raw.
 */

export const registerSchema = {
  body: {
    type: 'object',
    required: ['email', 'password', 'name'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email', maxLength: 255 },
      password: { type: 'string', minLength: 8, maxLength: 128 },
      name: { type: 'string', minLength: 1, maxLength: 255 },
    },
  },
} as const;

export const loginSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', format: 'email' },
      password: { type: 'string', minLength: 1 },
    },
  },
} as const;

export const refreshSchema = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    additionalProperties: false,
    properties: {
      refreshToken: { type: 'string', minLength: 1 },
    },
  },
} as const;
