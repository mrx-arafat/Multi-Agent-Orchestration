import { z } from 'zod';

/**
 * Zod schema for all environment variables.
 * Validation fails fast at startup if any required var is missing or invalid.
 */
const envSchema = z.object({
  // Server
  MAOF_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MAOF_HOST: z.string().default('0.0.0.0'),
  MAOF_NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MAOF_LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // PostgreSQL
  MAOF_DB_HOST: z.string().min(1),
  MAOF_DB_PORT: z.coerce.number().int().min(1).max(65535).default(5432),
  MAOF_DB_NAME: z.string().min(1),
  MAOF_DB_USER: z.string().min(1),
  MAOF_DB_PASSWORD: z.string().min(1),
  MAOF_DB_POOL_MIN: z.coerce.number().int().min(1).default(2),
  MAOF_DB_POOL_MAX: z.coerce.number().int().min(1).default(20),

  // Redis
  MAOF_REDIS_HOST: z.string().min(1).default('localhost'),
  MAOF_REDIS_PORT: z.coerce.number().int().min(1).max(65535).default(6379),
  MAOF_REDIS_PASSWORD: z.string().optional(),

  // JWT — secret must be at least 32 chars for security
  MAOF_JWT_SECRET: z.string().min(32, {
    message: 'MAOF_JWT_SECRET must be at least 32 characters long',
  }),
  MAOF_JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  MAOF_JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // CORS
  MAOF_CORS_ORIGINS: z.string().default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parse and validate environment variables.
 * Throws a ZodError with human-readable message on failure.
 * Returns cached result on subsequent calls.
 */
export function parseEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  if (_env !== null) return _env;

  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`❌ Invalid environment configuration:\n${errors}\n\nCheck your .env file.`);
  }

  _env = result.data;
  return _env;
}

/** Reset cached env — for testing only */
export function _resetEnvCache(): void {
  _env = null;
}
