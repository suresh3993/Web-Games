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
  /** `srcset` for responsive thumbnails (WebP widths), when an image was uploaded. */
  thumbnailSrcSet: string | null;
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

/** Highest score the API accepts at all (fits a Postgres INT); per-game plausibility limits are stricter. */
export const SCORE_HARD_LIMIT = 2_000_000_000;
/** Longest round the API accepts. */
export const MAX_ROUND_MS = 4 * 60 * 60 * 1000;

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
  /** Achievements unlocked by this round (their XP is included in `bonusXp`). */
  achievements: UnlockedAchievement[];
  /** Daily challenges completed by this round (their XP is included in `bonusXp`). */
  challengesCompleted: CompletedChallenge[];
  bonusXp: number;
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

// ---------------------------------------------------------------------------
// Profile & account
// ---------------------------------------------------------------------------

/** Accepted upload types (detected from the file bytes, never the declared type). */
export const IMAGE_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const THUMBNAIL_MAX_BYTES = 5 * 1024 * 1024;

export interface ProfileStats {
  /** Finished rounds that passed plausibility checks (preview rounds excluded). */
  rounds: number;
  gamesPlayed: number;
  playTimeMs: number;
  wins: number;
  achievementsUnlocked: number;
  achievementsTotal: number;
  challengesCompleted: number;
  /** Position on the global XP leaderboard (null without XP). */
  globalRank: number | null;
  /** XP at which the current level started and the next one begins. */
  levelStartXp: number;
  nextLevelXp: number;
}

export interface UserProfile {
  user: CurrentUser;
  stats: ProfileStats;
}

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

export const ACHIEVEMENT_ICONS = [
  'Trophy', 'Medal', 'Star', 'Flame', 'Crown', 'Target', 'Zap', 'Compass', 'Gamepad2', 'Timer',
  'Swords', 'Puzzle', 'Brain', 'Rocket', 'Award', 'Sparkles', 'CalendarCheck', 'Map', 'Heart', 'Gem',
] as const;
export type AchievementIcon = (typeof ACHIEVEMENT_ICONS)[number];

/**
 * Declarative unlock rules, evaluated by the API from recorded rounds (never from
 * client claims). Only rounds that passed plausibility checks count.
 */
export type AchievementCriteria =
  | { type: 'rounds_played'; count: number }
  | { type: 'distinct_games'; count: number }
  | { type: 'wins'; count: number; game?: string }
  | { type: 'score_at_least'; game: string; value: number }
  | { type: 'level_reached'; level: number }
  | { type: 'play_minutes'; minutes: number }
  | { type: 'category_games'; category: string; count: number }
  | { type: 'daily_challenges'; count: number };

export const ACHIEVEMENT_CRITERIA_TYPES = [
  'rounds_played', 'distinct_games', 'wins', 'score_at_least', 'level_reached', 'play_minutes', 'category_games', 'daily_challenges',
] as const satisfies readonly AchievementCriteria['type'][];

export interface AchievementSummary {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  xpReward: number;
  game: { slug: string; title: string } | null;
  /** Players who unlocked it. */
  unlockedBy: number;
}

export interface MyAchievement extends AchievementSummary {
  unlockedAt: string | null;
  progress: { current: number; target: number };
}

export interface UnlockedAchievement {
  key: string;
  name: string;
  icon: string;
  xpReward: number;
}

// ---------------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------------

export const CHALLENGE_TYPES = ['PLAY_GAMES', 'REACH_SCORE', 'PLAY_MINUTES', 'PLAY_CATEGORY'] as const;
export type ChallengeType = (typeof CHALLENGE_TYPES)[number];

export interface DailyChallengeView {
  id: string;
  /** UTC day, YYYY-MM-DD. */
  date: string;
  title: string;
  description: string;
  type: ChallengeType;
  target: number;
  xpReward: number;
  game: { slug: string; title: string } | null;
  category: { slug: string; name: string } | null;
  /** Null for guests. */
  progress: number | null;
  completedAt: string | null;
}

export interface DailyChallenges {
  date: string;
  /** Next UTC midnight. */
  resetsAt: string;
  challenges: DailyChallengeView[];
}

export interface CompletedChallenge {
  id: string;
  title: string;
  xpReward: number;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const NOTIFICATION_TYPES = ['SYSTEM', 'ACHIEVEMENT', 'CHALLENGE', 'LEVEL_UP', 'MODERATION'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationItem {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app path, e.g. "/achievements". */
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface UnreadCount {
  unread: number;
}

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

/** Icon names a category may use (rendered by the web app). */
export const CATEGORY_ICONS = [
  'Joystick', 'Puzzle', 'Brain', 'CarFront', 'Trophy', 'Castle', 'Grid3x3', 'Spade', 'Sparkles', 'Footprints', 'Layers', 'Type', 'Sigma', 'Users',
] as const;

export const REPORT_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface DayCount {
  date: string;
  count: number;
}

export interface AdminDashboard {
  totals: {
    users: number;
    verifiedUsers: number;
    suspendedUsers: number;
    newUsers7d: number;
    activeUsers1d: number;
    activeUsers7d: number;
    activeUsers30d: number;
    launches1d: number;
    launches7d: number;
    launches30d: number;
    gamesByStatus: Record<GameStatus, number>;
    openReports: number;
    flaggedScores7d: number;
  };
  launchesByDay: DayCount[];
  signupsByDay: DayCount[];
  topGames: { slug: string; title: string; launches: number; players: number }[];
  categories: { slug: string; name: string; launches: number; players: number; games: number }[];
  health: {
    database: { status: 'ok' | 'error'; latencyMs: number | null };
    redis: 'ok' | 'error' | 'disabled';
    uptimeSeconds: number;
    nodeVersion: string;
    environment: string;
    memoryMb: number;
    activeSessions: number;
    activeRounds: number;
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  role: Role;
  status: AccountStatus;
  emailVerified: boolean;
  xp: number;
  level: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  actor: { id: string; displayName: string; email: string } | null;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserRow {
  stats: { rounds: number; flaggedScores: number; reportsFiled: number; favorites: number; activeSessions: number };
  recentActivity: AuditLogEntry[];
}

export interface AdminGameRow {
  id: string;
  slug: string;
  title: string;
  status: GameStatus;
  engine: GameEngine;
  runtimeKey: string | null;
  isFeatured: boolean;
  playCount: number;
  primaryCategory: { slug: string; name: string };
  thumbnailUrl: string | null;
  publishedAt: string | null;
  updatedAt: string;
  /** A staff preview round was finished: the launch flow was tested on this deployment. */
  previewTested: boolean;
}

export interface AdminGameDetail extends AdminGameRow {
  shortDescription: string;
  description: string;
  instructions: string;
  difficulty: Difficulty;
  supportedDevices: DeviceType[];
  estimatedMinutes: number;
  supportsScores: boolean;
  maxScore: number | null;
  multiplayerMode: string | null;
  licenseType: LicenseType;
  licenseNotes: string | null;
  categories: string[];
  thumbnailSrcSet: string | null;
}

export interface AdminCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  accentColor: string;
  sortOrder: number;
  gameCount: number;
  publishedCount: number;
}

export interface AdminReport {
  id: string;
  game: { slug: string; title: string };
  reporter: { id: string; displayName: string } | null;
  reason: ReportReason;
  details: string;
  status: ReportStatus;
  resolutionNote: string | null;
  resolvedBy: { id: string; displayName: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminAchievement extends AchievementSummary {
  criteria: AchievementCriteria;
  isActive: boolean;
  createdAt: string;
}

export interface AdminChallenge {
  id: string;
  date: string;
  key: string;
  title: string;
  description: string;
  type: ChallengeType;
  target: number;
  xpReward: number;
  game: { slug: string; title: string } | null;
  category: { slug: string; name: string } | null;
  participants: number;
  completions: number;
}
