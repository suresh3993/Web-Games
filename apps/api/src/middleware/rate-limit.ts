import type { Request, RequestHandler } from 'express';
import { MemoryStore, rateLimit, type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { HttpError } from '../lib/http-error';
import { logger } from '../lib/logger';
import { redis } from '../lib/redis';

/**
 * Redis-backed store that degrades to a per-process memory store when Redis is
 * unreachable. Limits keep working during an outage (per instance rather than
 * cluster-wide) instead of either failing every request or silently disabling
 * brute-force protection.
 */
export class FallbackStore implements Store {
  private warned = false;

  constructor(
    private readonly primary: Store,
    private readonly fallback: MemoryStore,
    readonly prefix: string,
  ) {}

  init(options: Options) {
    this.primary.init?.(options);
    this.fallback.init(options);
  }

  private async attempt<T>(primary: () => Promise<T> | T, fallback: () => Promise<T> | T): Promise<T> {
    try {
      const result = await primary();
      this.warned = false;
      return result;
    } catch (err) {
      if (!this.warned) {
        logger.warn({ err: (err as Error).message, store: this.prefix }, 'rate-limit store unavailable; using in-memory fallback');
        this.warned = true;
      }
      return fallback();
    }
  }

  increment(key: string): Promise<ClientRateLimitInfo> {
    return this.attempt(() => this.primary.increment(key), () => this.fallback.increment(key));
  }

  async decrement(key: string): Promise<void> {
    await this.attempt(() => this.primary.decrement(key), () => this.fallback.decrement(key));
  }

  async resetKey(key: string): Promise<void> {
    await this.attempt(() => this.primary.resetKey(key), () => this.fallback.resetKey(key));
  }
}

const emailKey = (req: Request) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return email || 'anonymous';
};

function limiter(name: string, options: Partial<Options>): RequestHandler {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Redis-backed so limits hold across API replicas; in-memory otherwise (or during a Redis outage).
    store: redis
      ? new FallbackStore(
          new RedisStore({
            prefix: `rl:${name}:`,
            sendCommand: (command: string, ...args: string[]) => redis!.call(command, ...args) as Promise<RedisReply>,
          }),
          new MemoryStore(),
          `rl:${name}:`,
        )
      : undefined,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.')),
    ...options,
  });
}

/** Factories (not singletons) so every app instance — and every test — gets fresh counters. */
export function createRateLimiters() {
  return {
    /** Broad per-IP ceiling for the whole API. */
    api: limiter('api', { windowMs: 15 * 60_000, limit: 1000 }),
    /** Per-IP login attempts. */
    loginIp: limiter('login-ip', { windowMs: 15 * 60_000, limit: 30 }),
    /** Failed logins per account across all IPs (slows credential stuffing on one account). */
    loginAccount: limiter('login-account', {
      windowMs: 15 * 60_000,
      limit: 10,
      skipSuccessfulRequests: true,
      keyGenerator: emailKey,
    }),
    register: limiter('register', { windowMs: 60 * 60_000, limit: 10 }),
    /** Emails per IP for reset / verification resends. */
    emailActions: limiter('email-actions', { windowMs: 60 * 60_000, limit: 10 }),
    /** Token submissions (verify / reset) per IP — blocks token guessing. */
    tokenSubmit: limiter('token-submit', { windowMs: 15 * 60_000, limit: 30 }),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
