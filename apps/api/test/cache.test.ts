import { describe, expect, it, vi } from 'vitest';

// A Redis that is reachable but failing (e.g. command timeouts under load).
vi.mock('../src/lib/redis', () => {
  const fail = () => Promise.reject(new Error('Command timed out'));
  return { redis: { get: fail, set: fail, scan: fail, del: fail }, redisHealthy: async () => 'error' };
});

const { cached, invalidateCache } = await import('../src/lib/cache');

describe('cache with a failing Redis', () => {
  it('still loads values and never fails invalidation', async () => {
    const load = vi.fn(async () => ({ value: 42 }));
    await expect(cached('test:key', 30, load)).resolves.toEqual({ value: 42 });
    expect(load).toHaveBeenCalledTimes(1);
    // Invalidation runs after writes have committed: it must not turn success into an error.
    await expect(invalidateCache('test:')).resolves.toBeUndefined();
  });
});
