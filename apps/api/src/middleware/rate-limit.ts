import type { Request, RequestHandler } from 'express';
import { MemoryStore, rateLimit, type ClientRateLimitInfo, type Options, type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { env } from '../config/env';
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

/** Per-account key; only used after `requireAuth`, so every request has a user. */
const userKey = (req: Request) => req.auth?.user.id ?? 'anonymous';

/**
 * RedisStore preloads its Lua scripts in the constructor. When Redis is down at boot those
 * promises reject before anything awaits them (one "unhandled rejection" per script and
 * limiter). The store reloads scripts on demand, so mark the preloads as handled.
 */
export function createRedisStore(prefix: string, sendCommand: (...args: string[]) => Promise<RedisReply>): RedisStore {
  const store = new RedisStore({ prefix, sendCommand: (command: string, ...args: string[]) => sendCommand(command, ...args) });
  void store.incrementScriptSha.catch(() => undefined);
  void store.getScriptSha.catch(() => undefined);
  return store;
}

function limiter(name: string, options: Partial<Options>): RequestHandler {
  return rateLimit({
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Redis-backed so limits hold across API replicas; in-memory otherwise (or during a Redis outage).
    store: redis
      ? new FallbackStore(
          createRedisStore(`rl:${name}:`, (...args) => redis!.call(...(args as [string, ...string[]])) as Promise<RedisReply>),
          new MemoryStore(),
          `rl:${name}:`,
        )
      : undefined,
    handler: (_req, _res, next) =>
      next(new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please wait a few minutes and try again.')),
    ...options,
  });
}

/**
 * Factories (not singletons) so every app instance — and every test — gets fresh counters.
 * RATE_LIMIT_MULTIPLIER scales only the volume limits (general API and gameplay), e.g. for
 * automated smoke tests that launch every game; brute-force protections never scale.
 */
export function createRateLimiters(scale = env.rateLimitMultiplier) {
  return {
    /** Broad per-IP ceiling for the whole API. */
    api: limiter('api', { windowMs: 15 * 60_000, limit: 1000 * scale }),
    /** Image downloads per IP (cheap, immutable, browser-cached). */
    media: limiter('media', { windowMs: 15 * 60_000, limit: 5000 * scale }),
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
    /** Rounds started per account (one every ~7 s sustained). */
    gameStart: limiter('game-start', { windowMs: 15 * 60_000, limit: 120 * scale, keyGenerator: userKey }),
    /** Round submissions per account. */
    scoreSubmit: limiter('score-submit', { windowMs: 15 * 60_000, limit: 120 * scale, keyGenerator: userKey }),
    /** Game problem reports per account. */
    reports: limiter('reports', { windowMs: 60 * 60_000, limit: 10, keyGenerator: userKey }),
    /** Profile, avatar and other account edits per account. */
    accountChanges: limiter('account-changes', { windowMs: 60 * 60_000, limit: 30, keyGenerator: userKey }),
    /** Endpoints that check the current password (change password, delete account): slows guessing. */
    passwordConfirm: limiter('password-confirm', { windowMs: 15 * 60_000, limit: 10, keyGenerator: userKey }),
    /** Personal-data exports per account (each is a large read). */
    dataExport: limiter('data-export', { windowMs: 60 * 60_000, limit: 5, keyGenerator: userKey }),
    /** Staff uploads and catalog edits per account. */
    adminWrites: limiter('admin-writes', { windowMs: 15 * 60_000, limit: 300, keyGenerator: userKey }),
  };
}

export type RateLimiters = ReturnType<typeof createRateLimiters>;
