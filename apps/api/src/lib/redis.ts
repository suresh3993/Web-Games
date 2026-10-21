import { Redis } from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

/** Shared Redis client, or null when REDIS_URL is not configured (tests, minimal setups). */
export const redis: Redis | null = env.redisUrl
  ? new Redis(env.redisUrl, {
      maxRetriesPerRequest: 1,
      // Bound the latency a Redis outage can add to any request; callers fall back gracefully.
      commandTimeout: 1000,
      enableOfflineQueue: true,
      lazyConnect: false,
    })
  : null;

// Log connection problems once per outage rather than on every reconnect attempt.
let redisDown = false;
redis?.on('error', (err) => {
  if (redisDown) return;
  redisDown = true;
  logger.warn({ err: err.message || (err as NodeJS.ErrnoException).code }, 'redis unavailable; retrying in the background');
});
redis?.on('ready', () => {
  if (redisDown) logger.info('redis connection restored');
  redisDown = false;
});

export async function redisHealthy(): Promise<'ok' | 'error' | 'disabled'> {
  if (!redis) return 'disabled';
  try {
    return (await redis.ping()) === 'PONG' ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}
