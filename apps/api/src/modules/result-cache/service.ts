/**
 * Cross-workflow result caching service.
 * Deduplicates identical agent tasks across workflows using input hashing.
 */
import type { Redis } from 'ioredis';
import crypto from 'node:crypto';

const CACHE_PREFIX = 'maof:result-cache:';
const STATS_PREFIX = 'maof:cache-stats:';
const DEFAULT_TTL = 3600; // 1 hour

export interface CacheEntry {
  output: Record<string, unknown>;
  agentId: string;
  capability: string;
  cachedAt: string;
  ttlSeconds: number;
  hitCount: number;
}

export interface CacheStats {
  totalEntries: number;
  totalHits: number;
  totalMisses: number;
  hitRate: number;
}

/**
 * Generate a deterministic hash key from capability + input.
 */
export function computeCacheKey(capability: string, input: Record<string, unknown>): string {
  const normalized = JSON.stringify({ capability, input }, Object.keys({ capability, input }).sort());
  const hash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `${CACHE_PREFIX}${capability}:${hash}`;
}

/**
 * Check cache for a matching result.
 */
export async function getCachedResult(
  redis: Redis,
  capability: string,
  input: Record<string, unknown>,
): Promise<CacheEntry | null> {
  const key = computeCacheKey(capability, input);
  const raw = await redis.get(key);

  if (raw === null) {
    // Record miss
    await redis.incr(`${STATS_PREFIX}misses`).catch(() => {});
    return null;
  }

  try {
    const entry = JSON.parse(raw) as CacheEntry;
    entry.hitCount += 1;

    // Update hit count in cache
    const ttl = await redis.ttl(key);
    if (ttl > 0) {
      await redis.set(key, JSON.stringify(entry), 'EX', ttl);
    }

    // Record hit
    await redis.incr(`${STATS_PREFIX}hits`).catch(() => {});

    return entry;
  } catch {
    return null;
  }
}

/**
 * Store a result in cache.
 */
export async function cacheResult(
  redis: Redis,
  capability: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  agentId: string,
  ttlSeconds: number = DEFAULT_TTL,
): Promise<string> {
  const key = computeCacheKey(capability, input);

  const entry: CacheEntry = {
    output,
    agentId,
    capability,
    cachedAt: new Date().toISOString(),
    ttlSeconds,
    hitCount: 0,
  };

  await redis.set(key, JSON.stringify(entry), 'EX', ttlSeconds);
  await redis.incr(`${STATS_PREFIX}entries`).catch(() => {});

  return key;
}

/**
 * Invalidate a specific cache entry.
 */
export async function invalidateCacheEntry(
  redis: Redis,
  capability: string,
  input: Record<string, unknown>,
): Promise<boolean> {
  const key = computeCacheKey(capability, input);
  const deleted = await redis.del(key);
  return deleted > 0;
}

/**
 * Invalidate all cache entries for a capability.
 */
export async function invalidateCapabilityCache(
  redis: Redis,
  capability: string,
): Promise<number> {
  const pattern = `${CACHE_PREFIX}${capability}:*`;
  const keys = await redis.keys(pattern);
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}

/**
 * Invalidate the entire result cache.
 */
export async function invalidateAllCache(redis: Redis): Promise<number> {
  const keys = await redis.keys(`${CACHE_PREFIX}*`);
  if (keys.length === 0) return 0;
  return redis.del(...keys);
}

/**
 * Get cache statistics.
 */
export async function getCacheStats(redis: Redis): Promise<CacheStats> {
  const [hitsRaw, missesRaw] = await Promise.all([
    redis.get(`${STATS_PREFIX}hits`),
    redis.get(`${STATS_PREFIX}misses`),
  ]);

  const hits = parseInt(hitsRaw ?? '0', 10);
  const misses = parseInt(missesRaw ?? '0', 10);
  const total = hits + misses;

  // Count active entries
  const keys = await redis.keys(`${CACHE_PREFIX}*`);

  return {
    totalEntries: keys.length,
    totalHits: hits,
    totalMisses: misses,
    hitRate: total > 0 ? Math.round((hits / total) * 100) : 0,
  };
}

/**
 * Warm cache with pre-computed results.
 */
export async function warmCache(
  redis: Redis,
  entries: Array<{
    capability: string;
    input: Record<string, unknown>;
    output: Record<string, unknown>;
    agentId: string;
    ttlSeconds?: number;
  }>,
): Promise<number> {
  let warmed = 0;
  for (const entry of entries) {
    await cacheResult(redis, entry.capability, entry.input, entry.output, entry.agentId, entry.ttlSeconds);
    warmed++;
  }
  return warmed;
}
