import express from 'express';
import { MemoryStore, type Options, type Store } from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createRateLimiters, createRedisStore, FallbackStore } from '../src/middleware/rate-limit';

const options = { windowMs: 60_000 } as Options;

function failingStore(): Store {
  const fail = () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:6380'));
  return { increment: vi.fn(fail), decrement: vi.fn(fail), resetKey: vi.fn(fail) };
}

describe('FallbackStore (Redis outage resilience)', () => {
  it('keeps counting in memory when the primary store fails, instead of erroring', async () => {
    const store = new FallbackStore(failingStore(), new MemoryStore(), 'rl:test:');
    store.init(options);
    await store.increment('1.2.3.4');
    const info = await store.increment('1.2.3.4');
    expect(info.totalHits).toBe(2);
  });

  it('uses the primary store while it is healthy', async () => {
    const primary = new MemoryStore();
    const fallback = new MemoryStore();
    const store = new FallbackStore(primary, fallback, 'rl:test:');
    store.init(options);
    await store.increment('k');
    expect((await primary.get('k'))?.totalHits).toBe(1);
    expect(await fallback.get('k')).toBeUndefined();
  });
});

describe('RATE_LIMIT_MULTIPLIER', () => {
  it('scales volume limits but never brute-force protections', async () => {
    const limits = createRateLimiters(10);
    const app = express();
    app.get('/api', limits.api, (_req, res) => res.end());
    app.get('/start', limits.gameStart, (_req, res) => res.end());
    app.get('/login', limits.loginIp, (_req, res) => res.end());
    app.get('/token', limits.tokenSubmit, (_req, res) => res.end());
    const policy = async (path: string) => (await request(app).get(path)).headers['ratelimit-policy'];
    expect(await policy('/api')).toBe('10000;w=900');
    expect(await policy('/start')).toBe('1200;w=900');
    expect(await policy('/login')).toBe('30;w=900');
    expect(await policy('/token')).toBe('30;w=900');
  });
});

describe('createRedisStore', () => {
  it('does not surface unhandled rejections when Redis is down at startup', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const store = createRedisStore('rl:test:', () => Promise.reject(new Error('connect ECONNREFUSED')));
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).not.toHaveBeenCalled();
      // Later use still fails loudly, so FallbackStore can switch to memory.
      await expect(store.increment('k')).rejects.toThrow('ECONNREFUSED');
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
