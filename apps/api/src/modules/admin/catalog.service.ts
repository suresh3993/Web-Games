import type { Request } from 'express';
import { Prisma, type User } from '@prisma/client';
import { THUMBNAIL_MAX_BYTES, type AdminCategory, type AdminGameDetail, type AdminGameRow, type PaginationMeta } from '@playverse/shared-types';
import type { AdminGameCreate, AdminGameUpdate, AdminGamesQuery, CategoryInput, CategoryUpdate } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { invalidateCache } from '../../lib/cache';
import { HttpError, notFound } from '../../lib/http-error';
import { processImage } from '../../lib/images';
import { audit } from '../audit/audit';
import { defaultMediaUrl, mediaSrcSet, storeImage } from '../media/media.service';

const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);
const fieldError = (field: string, message: string) => new HttpError(400, 'VALIDATION_ERROR', message, { [field]: [message] });

/** Catalog lists (featured, trending, categories) are cached; drop them after any catalog change. */
const invalidateCatalog = () => invalidateCache('catalog:');

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

const adminGameSelect = {
  id: true,
  slug: true,
  title: true,
  status: true,
  engine: true,
  runtimeKey: true,
  isFeatured: true,
  playCount: true,
  publishedAt: true,
  updatedAt: true,
  thumbnailUrl: true,
  thumbnailImageId: true,
  primaryCategory: { select: { slug: true, name: true } },
  _count: { select: { sessions: { where: { preview: true, status: 'FINISHED' } } } },
} satisfies Prisma.GameSelect;

type AdminGameRowData = Prisma.GameGetPayload<{ select: typeof adminGameSelect }>;

const toRow = (g: AdminGameRowData): AdminGameRow => ({
  id: g.id,
  slug: g.slug,
  title: g.title,
  status: g.status,
  engine: g.engine,
  runtimeKey: g.runtimeKey,
  isFeatured: g.isFeatured,
  playCount: g.playCount,
  primaryCategory: g.primaryCategory,
  thumbnailUrl: g.thumbnailUrl,
  publishedAt: g.publishedAt?.toISOString() ?? null,
  updatedAt: g.updatedAt.toISOString(),
  previewTested: g._count.sessions > 0,
});

const GAME_SORT: Record<AdminGamesQuery['sort'], Prisma.GameOrderByWithRelationInput[]> = {
  title: [{ title: 'asc' }],
  updated: [{ updatedAt: 'desc' }],
  popular: [{ playCount: 'desc' }, { title: 'asc' }],
  status: [{ status: 'asc' }, { title: 'asc' }],
};

export async function listGames(q: AdminGamesQuery): Promise<{ items: AdminGameRow[]; meta: PaginationMeta }> {
  const where: Prisma.GameWhereInput = {
    ...(q.q ? { OR: [{ title: { contains: q.q, mode: 'insensitive' } }, { slug: { contains: q.q.toLowerCase() } }] } : {}),
    ...(q.status ? { status: q.status } : {}),
    ...(q.category ? { categories: { some: { category: { slug: q.category } } } } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.game.count({ where }),
    prisma.game.findMany({ where, select: adminGameSelect, orderBy: GAME_SORT[q.sort], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return { items: rows.map(toRow), meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } };
}

export async function gameDetail(id: string): Promise<AdminGameDetail> {
  const g = await prisma.game.findUnique({
    where: { id },
    select: {
      ...adminGameSelect,
      shortDescription: true,
      description: true,
      instructions: true,
      difficulty: true,
      supportedDevices: true,
      estimatedMinutes: true,
      supportsScores: true,
      maxScore: true,
      multiplayerMode: true,
      licenseType: true,
      licenseNotes: true,
      categories: { select: { category: { select: { slug: true } } } },
    },
  });
  if (!g) throw notFound('Game not found.');
  return {
    ...toRow(g),
    shortDescription: g.shortDescription,
    description: g.description,
    instructions: g.instructions,
    difficulty: g.difficulty,
    supportedDevices: g.supportedDevices,
    estimatedMinutes: g.estimatedMinutes,
    supportsScores: g.supportsScores,
    maxScore: g.maxScore,
    multiplayerMode: g.multiplayerMode,
    licenseType: g.licenseType,
    licenseNotes: g.licenseNotes,
    categories: g.categories.map((c) => c.category.slug),
    thumbnailSrcSet: g.thumbnailImageId ? mediaSrcSet(g.thumbnailImageId, 'game-thumbnail') : null,
  };
}

/** Resolves category slugs to ids; the primary category is always linked. */
async function resolveCategories(primary: string, extras: string[]) {
  const slugs = [...new Set([primary, ...extras])];
  const rows = await prisma.gameCategory.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const ids = new Map(rows.map((r) => [r.slug, r.id]));
  if (!ids.has(primary)) throw fieldError('primaryCategory', 'Unknown category.');
  const unknown = extras.filter((s) => !ids.has(s));
  if (unknown.length) throw fieldError('extraCategories', `Unknown categories: ${unknown.join(', ')}`);
  return { primaryId: ids.get(primary)!, linkIds: slugs.map((s) => ids.get(s)!) };
}

export async function createGame(actor: User, input: AdminGameCreate, req: Request): Promise<AdminGameDetail> {
  const { primaryId, linkIds } = await resolveCategories(input.primaryCategory, input.extraCategories);
  let id: string;
  try {
    const game = await prisma.game.create({
      data: {
        slug: input.slug,
        title: input.title,
        shortDescription: input.shortDescription,
        description: input.description,
        instructions: input.instructions,
        difficulty: input.difficulty,
        supportedDevices: input.supportedDevices,
        estimatedMinutes: input.estimatedMinutes,
        engine: input.engine,
        status: input.status,
        isFeatured: input.isFeatured,
        supportsScores: input.supportsScores,
        licenseType: 'ORIGINAL',
        licenseNotes: 'Catalog entry created in the admin dashboard; no runtime module yet.',
        primaryCategoryId: primaryId,
        categories: { create: linkIds.map((categoryId) => ({ categoryId })) },
      },
      select: { id: true },
    });
    id = game.id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('A game with this slug already exists.');
    throw err;
  }
  await audit(req, { action: 'admin.game_created', actorId: actor.id, targetType: 'game', targetId: id, metadata: { slug: input.slug, status: input.status } });
  await invalidateCatalog();
  return gameDetail(id);
}

/**
 * Updates metadata and status. Publishing requires a runtime module and a finished staff
 * preview round of this game on this deployment, so nothing is shown as playable unless
 * its launch flow was actually tested here.
 */
export async function updateGame(actor: User, id: string, input: AdminGameUpdate, req: Request): Promise<AdminGameDetail> {
  const current = await prisma.game.findUnique({
    where: { id },
    select: { id: true, slug: true, status: true, runtimeKey: true, publishedAt: true, primaryCategory: { select: { slug: true } }, categories: { select: { category: { select: { slug: true } } } } },
  });
  if (!current) throw notFound('Game not found.');

  if (input.status === 'PUBLISHED' && current.status !== 'PUBLISHED') {
    if (!current.runtimeKey) throw conflict('This game has no runtime module yet, so it cannot be published.');
    const tested = await prisma.gameSession.count({ where: { gameId: id, preview: true, status: 'FINISHED' } });
    if (!tested) throw conflict('Launch this game in preview mode and finish a round before publishing it.');
  }

  let links: { primaryId: string; linkIds: string[] } | null = null;
  if (input.primaryCategory !== undefined || input.extraCategories !== undefined) {
    const primary = input.primaryCategory ?? current.primaryCategory.slug;
    const extras = input.extraCategories ?? current.categories.map((c) => c.category.slug).filter((s) => s !== current.primaryCategory.slug);
    links = await resolveCategories(primary, extras);
  }

  const { primaryCategory: _p, extraCategories: _e, ...fields } = input;
  await prisma.$transaction(async (tx) => {
    await tx.game.update({
      where: { id },
      data: {
        ...fields,
        ...(links ? { primaryCategoryId: links.primaryId } : {}),
        ...(input.status === 'PUBLISHED' && !current.publishedAt ? { publishedAt: new Date() } : {}),
      },
    });
    if (links) {
      await tx.gameCategoryLink.deleteMany({ where: { gameId: id } });
      await tx.gameCategoryLink.createMany({ data: links.linkIds.map((categoryId) => ({ gameId: id, categoryId })) });
    }
  });

  const statusChanged = input.status !== undefined && input.status !== current.status;
  await audit(req, {
    action: statusChanged ? (input.status === 'PUBLISHED' ? 'admin.game_published' : 'admin.game_status_changed') : 'admin.game_updated',
    actorId: actor.id,
    targetType: 'game',
    targetId: id,
    metadata: { slug: current.slug, fields: Object.keys(input), ...(statusChanged ? { from: current.status, to: input.status } : {}) },
  });
  await invalidateCatalog();
  return gameDetail(id);
}

export async function deleteGame(actor: User, id: string, req: Request): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id },
    select: { id: true, slug: true, title: true, status: true, thumbnailImageId: true, _count: { select: { sessions: true, reports: true } } },
  });
  if (!game) throw notFound('Game not found.');
  if (game.status === 'PUBLISHED') throw conflict('Unpublish the game before deleting it.');
  if (game._count.sessions || game._count.reports) throw conflict('This game has play history or reports. Unpublish it instead of deleting it.');
  await prisma.$transaction(async (tx) => {
    await tx.game.delete({ where: { id } });
    if (game.thumbnailImageId) await tx.mediaImage.deleteMany({ where: { id: game.thumbnailImageId } });
  });
  await audit(req, { action: 'admin.game_deleted', actorId: actor.id, targetType: 'game', targetId: id, metadata: { slug: game.slug, title: game.title } });
  await invalidateCatalog();
}

export async function setThumbnail(actor: User, id: string, bytes: Buffer, req: Request): Promise<AdminGameDetail> {
  const game = await prisma.game.findUnique({ where: { id }, select: { id: true, slug: true, thumbnailImageId: true } });
  if (!game) throw notFound('Game not found.');
  const variants = await processImage(bytes, 'game-thumbnail', THUMBNAIL_MAX_BYTES);
  await prisma.$transaction(async (tx) => {
    const imageId = await storeImage(tx, 'game-thumbnail', actor.id, variants);
    await tx.game.update({ where: { id }, data: { thumbnailImageId: imageId, thumbnailUrl: defaultMediaUrl(imageId, 'game-thumbnail') } });
    if (game.thumbnailImageId) await tx.mediaImage.deleteMany({ where: { id: game.thumbnailImageId } });
  });
  await audit(req, { action: 'admin.game_thumbnail_updated', actorId: actor.id, targetType: 'game', targetId: id, metadata: { slug: game.slug } });
  await invalidateCatalog();
  return gameDetail(id);
}

export async function removeThumbnail(actor: User, id: string, req: Request): Promise<AdminGameDetail> {
  const game = await prisma.game.findUnique({ where: { id }, select: { id: true, slug: true, thumbnailImageId: true } });
  if (!game) throw notFound('Game not found.');
  if (game.thumbnailImageId) {
    await prisma.$transaction(async (tx) => {
      await tx.game.update({ where: { id }, data: { thumbnailImageId: null, thumbnailUrl: null } });
      await tx.mediaImage.deleteMany({ where: { id: game.thumbnailImageId! } });
    });
    await audit(req, { action: 'admin.game_thumbnail_removed', actorId: actor.id, targetType: 'game', targetId: id, metadata: { slug: game.slug } });
    await invalidateCatalog();
  }
  return gameDetail(id);
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<AdminCategory[]> {
  const [rows, all, published] = await Promise.all([
    prisma.gameCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.gameCategoryLink.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    prisma.gameCategoryLink.groupBy({ by: ['categoryId'], where: { game: { status: 'PUBLISHED' } }, _count: { _all: true } }),
  ]);
  const count = (list: typeof all, id: string) => list.find((r) => r.categoryId === id)?._count._all ?? 0;
  return rows.map((c) => ({
    id: c.id,
    slug: c.slug,
    name: c.name,
    description: c.description,
    icon: c.icon,
    accentColor: c.accentColor,
    sortOrder: c.sortOrder,
    gameCount: count(all, c.id),
    publishedCount: count(published, c.id),
  }));
}

async function categoryById(id: string): Promise<AdminCategory> {
  const category = (await listCategories()).find((c) => c.id === id);
  if (!category) throw notFound('Category not found.');
  return category;
}

export async function createCategory(actor: User, input: CategoryInput, req: Request): Promise<AdminCategory> {
  let id: string;
  try {
    id = (await prisma.gameCategory.create({ data: input, select: { id: true } })).id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('A category with this slug already exists.');
    throw err;
  }
  await audit(req, { action: 'admin.category_created', actorId: actor.id, targetType: 'category', targetId: id, metadata: { slug: input.slug } });
  await invalidateCatalog();
  return categoryById(id);
}

export async function updateCategory(actor: User, id: string, input: CategoryUpdate, req: Request): Promise<AdminCategory> {
  const existing = await prisma.gameCategory.findUnique({ where: { id }, select: { slug: true } });
  if (!existing) throw notFound('Category not found.');
  await prisma.gameCategory.update({ where: { id }, data: input });
  await audit(req, { action: 'admin.category_updated', actorId: actor.id, targetType: 'category', targetId: id, metadata: { slug: existing.slug, fields: Object.keys(input) } });
  await invalidateCatalog();
  return categoryById(id);
}

export async function deleteCategory(actor: User, id: string, req: Request): Promise<void> {
  const category = await prisma.gameCategory.findUnique({
    where: { id },
    select: { slug: true, _count: { select: { primaryGames: true, challenges: true } } },
  });
  if (!category) throw notFound('Category not found.');
  if (category._count.primaryGames) throw conflict('Games use this as their main category. Move them to another category first.');
  if (category._count.challenges) throw conflict('Daily challenges refer to this category, so it cannot be deleted.');
  await prisma.gameCategory.delete({ where: { id } });
  await audit(req, { action: 'admin.category_deleted', actorId: actor.id, targetType: 'category', targetId: id, metadata: { slug: category.slug } });
  await invalidateCatalog();
}
