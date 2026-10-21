import { z } from 'zod';
import {
  DEVICE_TYPES,
  DIFFICULTIES,
  GAME_OUTCOMES,
  GAME_SORTS,
  LEADERBOARD_PERIODS,
  PUBLIC_GAME_STATUSES,
  REPORT_REASONS,
} from '@playverse/shared-types';

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .max(254, 'Email is too long')
  .pipe(z.email('Enter a valid email address'))
  .transform((v) => v.toLowerCase());

/**
 * Length-based policy (NIST SP 800-63B): no arbitrary composition rules,
 * but a sensible minimum and a maximum that bounds hashing cost.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`)
  .refine((v) => v.trim().length > 0, 'Password cannot be only whitespace');

export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Display name must be at least 2 characters')
  .max(32, 'Display name must be at most 32 characters')
  .regex(/^[\p{L}\p{N} _.-]+$/u, 'Use letters, numbers, spaces, dots, dashes or underscores');

/** Opaque URL-safe token as issued by the API (base64url, 43 chars for 32 bytes). */
export const tokenSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{32,128}$/, 'Invalid or malformed token');

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const registerSchema = z.object({
  displayName: displayNameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  // Do not enforce the creation policy at login: legacy passwords must still work.
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({ token: tokenSchema, password: passwordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({ token: tokenSchema });
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Invalid slug');

/** Accepts `?device=MOBILE` (single) or repeated / comma-separated values. */
const csvEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v) => (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim().toUpperCase()).filter(Boolean))
    .pipe(z.array(z.enum(values)).max(values.length));

export const listGamesQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  category: slugSchema.optional(),
  difficulty: csvEnum(DIFFICULTIES).optional(),
  device: csvEnum(DEVICE_TYPES).optional(),
  status: z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(PUBLIC_GAME_STATUSES))
    .optional(),
  sort: z.enum(GAME_SORTS).default('popular'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
export type ListGamesQuery = z.infer<typeof listGamesQuerySchema>;
export type ListGamesQueryInput = z.input<typeof listGamesQuerySchema>;

// ---------------------------------------------------------------------------
// Gameplay
// ---------------------------------------------------------------------------

/** Prisma cuid() identifiers. */
export const idSchema = z.string().regex(/^c[a-z0-9]{20,31}$/, 'Invalid identifier');

export const startGameSessionSchema = z.object({ slug: slugSchema });
export type StartGameSessionInput = z.infer<typeof startGameSessionSchema>;

/** Highest score the API accepts at all (fits a Postgres INT); per-game plausibility limits are stricter. */
export const SCORE_HARD_LIMIT = 2_000_000_000;
export const MAX_ROUND_MS = 4 * 60 * 60 * 1000;

export const finishGameSessionSchema = z.object({
  score: z.number().int().min(0).max(SCORE_HARD_LIMIT),
  outcome: z.enum(GAME_OUTCOMES),
  durationMs: z.number().int().min(0).max(MAX_ROUND_MS),
  /** Game-specific counters, e.g. `{ lines: 12 }`. */
  stats: z
    .record(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/, 'Invalid stat name'), z.number().finite())
    .refine((s) => Object.keys(s).length <= 24, 'Too many stats')
    .default({}),
});
export type FinishGameSessionInput = z.infer<typeof finishGameSessionSchema>;

export const leaderboardQuerySchema = z.object({
  period: z.enum(LEADERBOARD_PERIODS).default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;

export const gameReportSchema = z.object({
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().min(10, 'Please describe the problem (at least 10 characters)').max(2000),
});
export type GameReportInput = z.infer<typeof gameReportSchema>;

/**
 * Converts a Zod error into `{ "path.to.field": ["message"] }`, the shape used by
 * the API's VALIDATION_ERROR responses and the web forms.
 */
export function flattenZodError(error: z.ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join('.') : '_root';
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

export { z };
