import { parseEnv, type Env } from './env.js';

export { parseEnv, type Env };
export { _resetEnvCache } from './env.js';

/**
 * Returns the validated configuration object.
 * Safe to call multiple times — result is cached.
 */
export function getConfig(): Env {
  return parseEnv(process.env);
}
