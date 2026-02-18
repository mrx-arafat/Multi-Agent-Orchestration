import type { FastifyBaseLogger } from 'fastify';
import type { Env } from '../config/index.js';

/**
 * Returns Pino logger options for the Fastify instance.
 * In development: pretty-printed with colors.
 * In production/test: compact JSON (stdout → ELK/aggregators).
 */
export function buildLoggerOptions(env: Pick<Env, 'MAOF_NODE_ENV' | 'MAOF_LOG_LEVEL'>) {
  const isDev = env.MAOF_NODE_ENV === 'development';
  // Return false to disable logging entirely in test/silent mode
  if (env.MAOF_LOG_LEVEL === 'silent') {
    return false as const;
  }

  return {
    level: env.MAOF_LOG_LEVEL,
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    }),
  };
}

export type Logger = FastifyBaseLogger;
