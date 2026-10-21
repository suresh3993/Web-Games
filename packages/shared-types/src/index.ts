/**
 * Shared API contracts. These types describe the JSON exchanged between
 * `apps/api` and `apps/web`. Enum-like unions mirror the Prisma enums in
 * `prisma/schema.prisma`; the API asserts that they stay in sync at compile time.
 */

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

export const ROLES = ['USER', 'MODERATOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const ACCOUNT_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const GAME_STATUSES = ['DRAFT', 'COMING_SOON', 'PUBLISHED', 'UNPUBLISHED'] as const;
export type GameStatus = (typeof GAME_STATUSES)[number];

/** Statuses visible in the public catalog. */
export const PUBLIC_GAME_STATUSES = ['COMING_SOON', 'PUBLISHED'] as const satisfies readonly GameStatus[];
export type PublicGameStatus = (typeof PUBLIC_GAME_STATUSES)[number];

export const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DEVICE_TYPES = ['DESKTOP', 'TABLET', 'MOBILE'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const GAME_ENGINES = ['CANVAS', 'DOM', 'PHASER', 'REACT', 'EXTERNAL_IFRAME'] as const;
export type GameEngine = (typeof GAME_ENGINES)[number];

export const LICENSE_TYPES = ['ORIGINAL', 'OPEN_SOURCE', 'LICENSED_PROVIDER'] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

export const GAME_SORTS = ['popular', 'newest', 'title', 'difficulty'] as const;
export type GameSort = (typeof GAME_SORTS)[number];

// ---------------------------------------------------------------------------
// Response envelopes
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  data: T;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiPaginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'CSRF_INVALID'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'ACCOUNT_SUSPENDED'
  | 'TOKEN_INVALID'
  | 'INTERNAL_ERROR';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** Field-level validation messages keyed by dotted path. */
    fields?: Record<string, string[]>;
    requestId?: string;
  };
}

// ---------------------------------------------------------------------------
// Users & auth
// ---------------------------------------------------------------------------

export interface CurrentUser {
  id: string;
  email: string;
  emailVerified: boolean;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  xp: number;
  level: number;
  createdAt: string;
}

export interface MessageResponse {
  message: string;
}

export interface CsrfResponse {
  csrfToken: string;
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  gameCount: number;
}

export interface GameSummary {
  id: string;
  slug: string;
  title: string;
  shortDescription: string;
  thumbnailUrl: string | null;
  difficulty: Difficulty;
  supportedDevices: DeviceType[];
  estimatedMinutes: number;
  status: PublicGameStatus;
  /** True only when the game is published AND its launch flow is implemented. */
  playable: boolean;
  isFeatured: boolean;
  supportsScores: boolean;
  primaryCategory: Pick<CategorySummary, 'slug' | 'name' | 'icon' | 'accentColor'>;
}

export interface GameDetail extends GameSummary {
  description: string;
  instructions: string;
  engine: GameEngine;
  /** Module key in @playverse/game-runtime; null until a runtime exists. */
  runtimeKey: string | null;
  supportsProgress: boolean;
  multiplayerMode: string | null;
  licenseType: LicenseType;
  categories: Pick<CategorySummary, 'slug' | 'name' | 'icon' | 'accentColor'>[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Gameplay, scores and progression
// ---------------------------------------------------------------------------

/** Mirrors `GameOutcome` in @playverse/game-runtime. */
export const GAME_OUTCOMES = ['won', 'lost', 'completed', 'quit'] as const;
export type GameOutcome = (typeof GAME_OUTCOMES)[number];

export const LEADERBOARD_PERIODS = ['all', 'week', 'day'] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const REPORT_REASONS = ['BROKEN', 'INAPPROPRIATE', 'CHEATING', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * XP rules (enforced by the API, shown by the web):
 *  - A finished round of at least XP_MIN_ROUND_MS earns 10 XP plus 4 XP per active minute, at most 30.
 *  - At most XP_DAILY_CAP_PER_GAME XP per game per UTC day; flagged and preview rounds earn nothing.
 *  - Reaching level n needs 100 × n × (n − 1) / 2 total XP (L2 = 100, L3 = 300, L4 = 600 …).
 */
export const XP_MIN_ROUND_MS = 10_000;
export const XP_PER_ROUND_BASE = 10;
export const XP_PER_ROUND_MAX = 30;
export const XP_DAILY_CAP_PER_GAME = 300;

export function xpForRound(activeMs: number): number {
  if (!(activeMs >= XP_MIN_ROUND_MS)) return 0;
  return Math.min(XP_PER_ROUND_MAX, XP_PER_ROUND_BASE + Math.floor((activeMs / 60_000) * 4));
}

/** Total XP needed to reach `level` (level 1 needs 0). */
export function xpForLevel(level: number): number {
  const n = Math.max(1, Math.floor(level));
  return (100 * n * (n - 1)) / 2;
}

export function levelForXp(xp: number): number {
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * Math.max(0, xp)) / 100)) / 2));
  // Guard against floating-point error at exact thresholds.
  while (xpForLevel(level + 1) <= xp) level++;
  while (level > 1 && xpForLevel(level) > xp) level--;
  return level;
}

export interface GameSessionStart {
  id: string;
  /** Server-issued seed for the round's deterministic RNG. */
  seed: string;
  /** Staff QA launch of an unpublished game: nothing is scored, ranked or rewarded. */
  preview: boolean;
  startedAt: string;
  personalBest: number | null;
}

export interface GameSessionResult {
  sessionId: string;
  preview: boolean;
  score: number;
  outcome: GameOutcome;
  /** Active play time accepted by the server (bounded by wall-clock time). */
  durationMs: number;
  /** Failed plausibility checks: stored for review but kept off leaderboards and personal bests. */
  flagged: boolean;
  personalBest: number | null;
  isPersonalBest: boolean;
  /** All-time rank on the game's leaderboard (null when unranked). */
  rank: number | null;
  xpAwarded: number;
  /** Why fewer XP than a full round were awarded, if so. */
  xpNote: string | null;
  xp: number;
  level: number;
  leveledUp: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  score: number;
  achievedAt: string;
  isYou: boolean;
}

export interface Leaderboard {
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
}

export interface GlobalLeaderboardEntry {
  rank: number;
  displayName: string;
  avatarUrl: string | null;
  level: number;
  xp: number;
  isYou: boolean;
}

export interface MyGameStats {
  bestScore: number | null;
  plays: number;
  totalTimeMs: number;
  lastPlayedAt: string | null;
  rank: number | null;
  isFavorite: boolean;
}

export interface PlayHistoryEntry {
  game: GameSummary;
  bestScore: number | null;
  plays: number;
  totalTimeMs: number;
  lastPlayedAt: string;
}

export interface FavoriteGame extends GameSummary {
  favoritedAt: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: { database: 'ok' | 'error'; redis: 'ok' | 'error' | 'disabled' };
}
