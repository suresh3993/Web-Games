import path from 'node:path';
import { config } from 'dotenv';
import { z } from 'zod';

// Load the monorepo-root .env when running from apps/api (dev), or the cwd .env.
// Real environment variables always win over file values.
config({ path: [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../../.env')], quiet: true });

const booleanish = z
  .enum(['true', 'false', '1', '0', ''])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  APP_URL: z.url().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(168),
  COOKIE_SECURE: booleanish,
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: optionalString,
  MAIL_TRANSPORT: z.enum(['smtp', 'memory']).default('smtp'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: booleanish,
  SMTP_USER: optionalString,
  SMTP_PASSWORD: optionalString,
  MAIL_FROM: z.string().default('SURESH <no-reply@suresh.local>'),
  API_DOCS_ENABLED: z.enum(['true', 'false', '1', '0']).optional(),
  RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(100).default(1),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${details}`);
}
const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production';
// Secure cookies are mandatory in production unless explicitly running the plain-HTTP local stack.
const cookieSecure = raw.COOKIE_SECURE || (isProduction && process.env.COOKIE_SECURE === undefined);

export const env = {
  nodeEnv: raw.NODE_ENV,
  isProduction,
  isTest: raw.NODE_ENV === 'test',
  port: raw.API_PORT,
  corsOrigins: raw.CORS_ORIGINS.split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
  appUrl: raw.APP_URL.replace(/\/$/, ''),
  trustProxy: raw.TRUST_PROXY,
  logLevel: raw.NODE_ENV === 'test' ? 'silent' : raw.LOG_LEVEL,
  sessionTtlMs: raw.SESSION_TTL_HOURS * 60 * 60 * 1000,
  cookieSecure,
  databaseUrl: raw.DATABASE_URL,
  redisUrl: raw.REDIS_URL,
  mail: {
    transport: raw.MAIL_TRANSPORT,
    host: raw.SMTP_HOST,
    port: raw.SMTP_PORT,
    secure: raw.SMTP_SECURE,
    user: raw.SMTP_USER,
    password: raw.SMTP_PASSWORD,
    from: raw.MAIL_FROM,
  },
  apiDocsEnabled: raw.API_DOCS_ENABLED ? ['true', '1'].includes(raw.API_DOCS_ENABLED) : !isProduction,
  /** Scales the general API and gameplay limits (never the login/registration/token limits). */
  rateLimitMultiplier: raw.RATE_LIMIT_MULTIPLIER,
} as const;

export type Env = typeof env;
