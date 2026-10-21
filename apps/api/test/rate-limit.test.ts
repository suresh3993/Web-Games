import { MemoryStore, type Options, type Store } from 'express-rate-limit';
import { describe, expect, it, vi } from 'vitest';
import { FallbackStore } from '../src/middleware/rate-limit';

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
