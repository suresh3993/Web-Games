import { z } from 'zod';
import {
  ACCOUNT_STATUSES,
  ACHIEVEMENT_ICONS,
  CATEGORY_ICONS,
  CHALLENGE_TYPES,
  DEVICE_TYPES,
  DIFFICULTIES,
  GAME_OUTCOMES,
  GAME_SORTS,
  GAME_STATUSES,
  LEADERBOARD_PERIODS,
  MAX_ROUND_MS,
  PUBLIC_GAME_STATUSES,
  REPORT_REASONS,
  REPORT_STATUSES,
  ROLES,
  SCORE_HARD_LIMIT,
} from '@playverse/shared-types';

// Plain constants live in shared-types (no zod), so browser code can use them cheaply.
export { MAX_ROUND_MS, SCORE_HARD_LIMIT };

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

/** `preview`: staff-only QA round of any game, never scored or rewarded. */
export const startGameSessionSchema = z.object({ slug: slugSchema, preview: z.boolean().optional() });
export type StartGameSessionInput = z.infer<typeof startGameSessionSchema>;

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

// ---------------------------------------------------------------------------
// Profile & account
// ---------------------------------------------------------------------------

export const updateProfileSchema = z.object({ displayName: displayNameSchema });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password').max(PASSWORD_MAX_LENGTH),
    newPassword: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.newPassword, { path: ['newPassword'], message: 'Choose a password you have not used here' });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm').max(PASSWORD_MAX_LENGTH),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

const booleanQuery = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const pageQuery = {
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};

export const notificationsQuerySchema = z.object({ unread: booleanQuery.optional(), ...pageQuery });
export type NotificationsQuery = z.infer<typeof notificationsQuerySchema>;

// ---------------------------------------------------------------------------
// Achievements & challenges
// ---------------------------------------------------------------------------

const count = z.number().int().min(1).max(100_000);

export const achievementCriteriaSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('rounds_played'), count }),
  z.object({ type: z.literal('distinct_games'), count }),
  z.object({ type: z.literal('wins'), count, game: slugSchema.optional() }),
  z.object({ type: z.literal('score_at_least'), game: slugSchema, value: z.number().int().min(1).max(SCORE_HARD_LIMIT) }),
  z.object({ type: z.literal('level_reached'), level: z.number().int().min(2).max(1000) }),
  z.object({ type: z.literal('play_minutes'), minutes: count }),
  z.object({ type: z.literal('category_games'), category: slugSchema, count }),
  z.object({ type: z.literal('daily_challenges'), count }),
]);

export const achievementInputSchema = z.object({
  key: slugSchema,
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(5).max(200),
  icon: z.enum(ACHIEVEMENT_ICONS),
  xpReward: z.number().int().min(0).max(1000),
  criteria: achievementCriteriaSchema,
  isActive: z.boolean().default(true),
});
export type AchievementInput = z.infer<typeof achievementInputSchema>;
export const achievementUpdateSchema = achievementInputSchema.omit({ key: true }).partial();
export type AchievementUpdate = z.infer<typeof achievementUpdateSchema>;

/** UTC calendar day. */
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Invalid date');

const challengeFields = z.object({
  date: dateSchema,
  title: z.string().trim().min(3).max(80),
  description: z.string().trim().min(5).max(200),
  type: z.enum(CHALLENGE_TYPES),
  target: z.number().int().min(1).max(SCORE_HARD_LIMIT),
  xpReward: z.number().int().min(0).max(500),
  game: slugSchema.nullish(),
  category: slugSchema.nullish(),
});

const challengeRefs = (v: { type?: string; game?: string | null; category?: string | null }, ctx: z.RefinementCtx) => {
  if (v.type === 'REACH_SCORE' && !v.game) ctx.addIssue({ code: 'custom', path: ['game'], message: 'Choose the game whose score counts' });
  if (v.type === 'PLAY_CATEGORY' && !v.category) ctx.addIssue({ code: 'custom', path: ['category'], message: 'Choose a category' });
};

export const challengeInputSchema = challengeFields.superRefine(challengeRefs);
export type ChallengeInput = z.infer<typeof challengeInputSchema>;
export const challengeUpdateSchema = challengeFields.omit({ date: true }).partial().superRefine(challengeRefs);
export type ChallengeUpdate = z.infer<typeof challengeUpdateSchema>;

export const challengesQuerySchema = z.object({ from: dateSchema.optional(), to: dateSchema.optional() });

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export const adminGamesQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.string().trim().toUpperCase().pipe(z.enum(GAME_STATUSES)).optional(),
  category: slugSchema.optional(),
  sort: z.enum(['title', 'updated', 'popular', 'status']).default('title'),
  ...pageQuery,
});
export type AdminGamesQuery = z.infer<typeof adminGamesQuerySchema>;

const gameFields = {
  title: z.string().trim().min(2).max(80),
  shortDescription: z.string().trim().min(10).max(280),
  description: z.string().trim().min(20).max(4000),
  instructions: z.string().trim().min(10).max(4000),
  difficulty: z.enum(DIFFICULTIES),
  supportedDevices: z.array(z.enum(DEVICE_TYPES)).min(1).max(DEVICE_TYPES.length),
  estimatedMinutes: z.number().int().min(1).max(240),
  primaryCategory: slugSchema,
  extraCategories: z.array(slugSchema).max(5).default([]),
  isFeatured: z.boolean().default(false),
  supportsScores: z.boolean().default(true),
};

/** New catalog entries never get a runtime through the API: runtimes ship with the code. */
export const adminGameCreateSchema = z.object({
  slug: slugSchema,
  engine: z.enum(['CANVAS', 'DOM']),
  status: z.enum(['DRAFT', 'COMING_SOON']).default('DRAFT'),
  ...gameFields,
});
export type AdminGameCreate = z.infer<typeof adminGameCreateSchema>;

export const adminGameUpdateSchema = z
  .object({ ...gameFields, status: z.enum(GAME_STATUSES) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
export type AdminGameUpdate = z.infer<typeof adminGameUpdateSchema>;

export const categoryInputSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(2).max(40),
  description: z.string().trim().min(5).max(200),
  icon: z.enum(CATEGORY_ICONS),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #7c5cff'),
  sortOrder: z.number().int().min(0).max(1000).default(0),
});
export type CategoryInput = z.infer<typeof categoryInputSchema>;
export const categoryUpdateSchema = categoryInputSchema.omit({ slug: true }).partial();
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;

export const adminUsersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.string().trim().toUpperCase().pipe(z.enum(ROLES)).optional(),
  status: z.string().trim().toUpperCase().pipe(z.enum(ACCOUNT_STATUSES)).optional(),
  sort: z.enum(['newest', 'oldest', 'name', 'xp', 'lastLogin']).default('newest'),
  ...pageQuery,
});
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;

export const userStatusSchema = z.object({
  status: z.enum(ACCOUNT_STATUSES),
  reason: z.string().trim().min(5, 'Give a short reason (it is recorded in the audit log)').max(500),
});
export type UserStatusInput = z.infer<typeof userStatusSchema>;

export const userRoleSchema = z.object({ role: z.enum(ROLES) });

export const adminReportsQuerySchema = z.object({
  status: z.string().trim().toUpperCase().pipe(z.enum(REPORT_STATUSES)).optional(),
  ...pageQuery,
});

export const reportUpdateSchema = z.object({
  status: z.enum(['IN_REVIEW', 'RESOLVED', 'DISMISSED']),
  resolutionNote: z.string().trim().max(2000).optional(),
});
export type ReportUpdateInput = z.infer<typeof reportUpdateSchema>;

export const auditLogQuerySchema = z.object({
  action: z.string().trim().max(64).optional(),
  actorId: idSchema.optional(),
  targetType: z.string().trim().max(32).optional(),
  targetId: z.string().trim().max(64).optional(),
  from: dateSchema.optional(),
  to: dateSchema.optional(),
  ...pageQuery,
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

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
