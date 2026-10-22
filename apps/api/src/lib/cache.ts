import { redis } from './redis';
import { logger } from './logger';

/**
 * Read-through cache for expensive, user-agnostic reads (catalog aggregates).
 * Uses Redis when configured, otherwise a small in-process map.
 */
const local = new Map<string, { expires: number; value: string }>();
const PREFIX = 'cache:';

export async function cached<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
  try {
    if (redis) {
      const hit = await redis.get(PREFIX + key);
      if (hit !== null) return JSON.parse(hit) as T;
    } else {
      const hit = local.get(key);
      if (hit && hit.expires > Date.now()) return JSON.parse(hit.value) as T;
    }
  } catch (err) {
    logger.warn({ err, key }, 'cache read failed; loading from source');
  }

  const value = await load();
  const serialized = JSON.stringify(value);
  try {
    if (redis) await redis.set(PREFIX + key, serialized, 'EX', ttlSeconds);
    else local.set(key, { expires: Date.now() + ttlSeconds * 1000, value: serialized });
  } catch (err) {
    logger.warn({ err, key }, 'cache write failed');
  }
  return value;
}

/**
 * Drops cached entries whose key starts with `prefix` (call after writes). Best effort:
 * it runs after the write has committed, so a Redis problem must never turn a successful
 * request into an error. Entries expire on their own TTL anyway.
 */
export async function invalidateCache(prefix: string): Promise<void> {
  for (const key of local.keys()) if (key.startsWith(prefix)) local.delete(key);
  if (!redis) return;
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${PREFIX}${prefix}*`, 'COUNT', 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  } catch (err) {
    logger.warn({ err, prefix }, 'cache invalidation failed; entries will expire on their TTL');
  }
}
