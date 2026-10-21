import type { Prisma } from '@prisma/client';
import {
  PUBLIC_GAME_STATUSES,
  type CategorySummary,
  type GameDetail,
  type GameSummary,
  type PaginationMeta,
  type PublicGameStatus,
} from '@playverse/shared-types';
import type { ListGamesQuery } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { cached } from '../../lib/cache';
import { notFound } from '../../lib/http-error';

export const PUBLIC = { in: [...PUBLIC_GAME_STATUSES] } satisfies Prisma.EnumGameStatusFilter;

const categoryBrief = { select: { slug: true, name: true, icon: true, accentColor: true } } as const;

export const summarySelect = {
  id: true,
  slug: true,
  title: true,
  shortDescription: true,
  thumbnailUrl: true,
  difficulty: true,
  supportedDevices: true,
  estimatedMinutes: true,
  status: true,
  isFeatured: true,
  supportsScores: true,
  engine: true,
  runtimeKey: true,
  externalUrl: true,
  primaryCategory: categoryBrief,
} satisfies Prisma.GameSelect;

export type SummaryRow = Prisma.GameGetPayload<{ select: typeof summarySelect }>;

/** A game is launchable only when published and backed by a runtime module or vetted provider URL. */
const isPlayable = (g: Pick<SummaryRow, 'status' | 'engine' | 'runtimeKey' | 'externalUrl'>) =>
  g.status === 'PUBLISHED' && (g.engine === 'EXTERNAL_IFRAME' ? Boolean(g.externalUrl) : Boolean(g.runtimeKey));

export function toSummary(g: SummaryRow): GameSummary {
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    shortDescription: g.shortDescription,
    thumbnailUrl: g.thumbnailUrl,
    difficulty: g.difficulty,
    supportedDevices: g.supportedDevices,
    estimatedMinutes: g.estimatedMinutes,
    status: g.status as PublicGameStatus,
    playable: isPlayable(g),
    isFeatured: g.isFeatured,
    supportsScores: g.supportsScores,
    primaryCategory: g.primaryCategory,
  };
}

const ORDER_BY: Record<ListGamesQuery['sort'], Prisma.GameOrderByWithRelationInput[]> = {
  popular: [{ playCount: 'desc' }, { title: 'asc' }],
  newest: [{ createdAt: 'desc' }, { title: 'asc' }],
  title: [{ title: 'asc' }],
  difficulty: [{ difficulty: 'asc' }, { title: 'asc' }],
};

export async function listGames(query: ListGamesQuery): Promise<{ items: GameSummary[]; meta: PaginationMeta }> {
  const where: Prisma.GameWhereInput = {
    status: query.status ?? PUBLIC,
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { shortDescription: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
    ...(query.category ? { categories: { some: { category: { slug: query.category } } } } : {}),
    ...(query.difficulty?.length ? { difficulty: { in: query.difficulty } } : {}),
    ...(query.device?.length ? { supportedDevices: { hasSome: query.device } } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.game.count({ where }),
    prisma.game.findMany({
      where,
      select: summarySelect,
      orderBy: ORDER_BY[query.sort],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  return {
    items: rows.map(toSummary),
    meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
  };
}

export function featuredGames(): Promise<GameSummary[]> {
  return cached('catalog:featured', 60, async () => {
    const rows = await prisma.game.findMany({
      where: { status: PUBLIC, isFeatured: true },
      select: summarySelect,
      // Enum order DRAFT < COMING_SOON < PUBLISHED, so desc puts playable games first.
      orderBy: [{ status: 'desc' }, { playCount: 'desc' }, { title: 'asc' }],
      take: 12,
    });
    return rows.map(toSummary);
  });
}

/** Most-launched games over the last 7 days, topped up by all-time popularity. */
export function trendingGames(limit = 12): Promise<GameSummary[]> {
  return cached('catalog:trending', 120, async () => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recent = await prisma.gameSession.groupBy({
      by: ['gameId'],
      where: { startedAt: { gte: since }, game: { status: PUBLIC } },
      _count: { gameId: true },
      orderBy: { _count: { gameId: 'desc' } },
      take: limit,
    });
    const recentIds = recent.map((r) => r.gameId);
    const [recentRows, fillRows] = await Promise.all([
      prisma.game.findMany({ where: { id: { in: recentIds } }, select: summarySelect }),
      prisma.game.findMany({
        where: { status: PUBLIC, id: { notIn: recentIds } },
        select: summarySelect,
        orderBy: [{ status: 'desc' }, { playCount: 'desc' }, { createdAt: 'desc' }],
        take: Math.max(0, limit - recentIds.length),
      }),
    ]);
    const byId = new Map(recentRows.map((r) => [r.id, r]));
    const ordered = recentIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
    return [...ordered, ...fillRows].map(toSummary);
  });
}

export function listCategories(): Promise<CategorySummary[]> {
  return cached('catalog:categories', 300, async () => {
    const rows = await prisma.gameCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { games: { where: { game: { status: PUBLIC } } } } } },
    });
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      description: c.description,
      icon: c.icon,
      accentColor: c.accentColor,
      gameCount: c._count.games,
    }));
  });
}

export async function getGameBySlug(slug: string): Promise<GameDetail> {
  const g = await prisma.game.findFirst({
    where: { slug, status: PUBLIC },
    select: {
      ...summarySelect,
      description: true,
      instructions: true,
      supportsProgress: true,
      multiplayerMode: true,
      licenseType: true,
      createdAt: true,
      updatedAt: true,
      categories: { select: { category: categoryBrief }, orderBy: { category: { sortOrder: 'asc' } } },
    },
  });
  if (!g) throw notFound('Game not found.');
  return {
    ...toSummary(g),
    description: g.description,
    instructions: g.instructions,
    engine: g.engine,
    runtimeKey: g.runtimeKey,
    supportsProgress: g.supportsProgress,
    multiplayerMode: g.multiplayerMode,
    licenseType: g.licenseType,
    categories: g.categories.map((c) => c.category),
    createdAt: g.createdAt.toISOString(),
    updatedAt: g.updatedAt.toISOString(),
  };
}

export async function relatedGames(slug: string, limit = 6): Promise<GameSummary[]> {
  const game = await prisma.game.findFirst({
    where: { slug, status: PUBLIC },
    select: { id: true, primaryCategoryId: true },
  });
  if (!game) throw notFound('Game not found.');
  const rows = await prisma.game.findMany({
    where: {
      status: PUBLIC,
      id: { not: game.id },
      categories: { some: { categoryId: game.primaryCategoryId } },
    },
    select: summarySelect,
    orderBy: [{ status: 'desc' }, { playCount: 'desc' }, { title: 'asc' }],
    take: limit,
  });
  return rows.map(toSummary);
}

/** Resolves a public (COMING_SOON or PUBLISHED) game by slug, or throws 404. */
export async function requirePublicGame(slug: string) {
  const game = await prisma.game.findFirst({
    where: { slug, status: PUBLIC },
    select: { id: true, status: true, supportsScores: true },
  });
  if (!game) throw notFound('Game not found.');
  return game;
}
