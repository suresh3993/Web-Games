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

export const GAME_ENGINES = ['CANVAS', 'PHASER', 'REACT', 'EXTERNAL_IFRAME'] as const;
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
  supportsProgress: boolean;
  multiplayerMode: string | null;
  licenseType: LicenseType;
  categories: Pick<CategorySummary, 'slug' | 'name' | 'icon' | 'accentColor'>[];
  createdAt: string;
  updatedAt: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  checks: { database: 'ok' | 'error'; redis: 'ok' | 'error' | 'disabled' };
}
