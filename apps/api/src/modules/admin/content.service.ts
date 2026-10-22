import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { Prisma, type User } from '@prisma/client';
import type { AchievementCriteria, AdminAchievement, AdminChallenge } from '@playverse/shared-types';
import type { AchievementInput, AchievementUpdate, ChallengeInput, ChallengeUpdate } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { HttpError, notFound } from '../../lib/http-error';
import { audit } from '../audit/audit';
import { achievementSelect, invalidateAchievementCache, parseCriteria, toAchievementSummary } from '../progression/achievements.service';
import { dayKey, dayStart } from '../progression/challenges.service';

const conflict = (message: string) => new HttpError(409, 'CONFLICT', message);
const fieldError = (field: string, message: string) => new HttpError(400, 'VALIDATION_ERROR', message, { [field]: [message] });

// ---------------------------------------------------------------------------
// Achievements
// ---------------------------------------------------------------------------

type AchievementRow = Prisma.AchievementGetPayload<{ select: typeof achievementSelect }>;

function toAdminAchievement(row: AchievementRow): AdminAchievement {
  return {
    ...toAchievementSummary(row),
    // Invalid stored criteria are surfaced as-is so an admin can fix them.
    criteria: (parseCriteria(row) ?? row.criteria) as AchievementCriteria,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listAchievements(): Promise<AdminAchievement[]> {
  const rows = await prisma.achievement.findMany({ select: achievementSelect, orderBy: [{ isActive: 'desc' }, { xpReward: 'asc' }, { name: 'asc' }] });
  return rows.map(toAdminAchievement);
}

/** Checks that games and categories named in the criteria exist; returns the linked game, if any. */
async function resolveCriteria(criteria: AchievementCriteria): Promise<string | null> {
  const gameSlug = criteria.type === 'score_at_least' || criteria.type === 'wins' ? criteria.game : undefined;
  if (criteria.type === 'category_games') {
    const exists = await prisma.gameCategory.count({ where: { slug: criteria.category } });
    if (!exists) throw fieldError('criteria.category', 'Unknown category.');
  }
  if (!gameSlug) return null;
  const game = await prisma.game.findUnique({ where: { slug: gameSlug }, select: { id: true } });
  if (!game) throw fieldError('criteria.game', 'Unknown game.');
  return game.id;
}

async function achievementById(id: string): Promise<AdminAchievement> {
  const row = await prisma.achievement.findUnique({ where: { id }, select: achievementSelect });
  if (!row) throw notFound('Achievement not found.');
  return toAdminAchievement(row);
}

export async function createAchievement(actor: User, input: AchievementInput, req: Request): Promise<AdminAchievement> {
  const gameId = await resolveCriteria(input.criteria);
  let id: string;
  try {
    id = (await prisma.achievement.create({ data: { ...input, criteria: input.criteria as Prisma.InputJsonObject, gameId }, select: { id: true } })).id;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw conflict('An achievement with this key already exists.');
    throw err;
  }
  await audit(req, { action: 'admin.achievement_created', actorId: actor.id, targetType: 'achievement', targetId: id, metadata: { key: input.key } });
  await invalidateAchievementCache();
  return achievementById(id);
}

export async function updateAchievement(actor: User, id: string, input: AchievementUpdate, req: Request): Promise<AdminAchievement> {
  const existing = await prisma.achievement.findUnique({ where: { id }, select: { key: true } });
  if (!existing) throw notFound('Achievement not found.');
  const gameId = input.criteria ? await resolveCriteria(input.criteria) : undefined;
  await prisma.achievement.update({
    where: { id },
    data: {
      ...input,
      ...(input.criteria ? { criteria: input.criteria as Prisma.InputJsonObject, gameId } : {}),
    },
  });
  await audit(req, { action: 'admin.achievement_updated', actorId: actor.id, targetType: 'achievement', targetId: id, metadata: { key: existing.key, fields: Object.keys(input) } });
  await invalidateAchievementCache();
  return achievementById(id);
}

export async function deleteAchievement(actor: User, id: string, req: Request): Promise<void> {
  const existing = await prisma.achievement.findUnique({ where: { id }, select: { key: true, _count: { select: { users: true } } } });
  if (!existing) throw notFound('Achievement not found.');
  if (existing._count.users) throw conflict('Players have already unlocked this achievement. Deactivate it instead.');
  await prisma.achievement.delete({ where: { id } });
  await audit(req, { action: 'admin.achievement_deleted', actorId: actor.id, targetType: 'achievement', targetId: id, metadata: { key: existing.key } });
  await invalidateAchievementCache();
}

// ---------------------------------------------------------------------------
// Daily challenges
// ---------------------------------------------------------------------------

const challengeSelect = {
  id: true,
  date: true,
  key: true,
  title: true,
  description: true,
  type: true,
  target: true,
  xpReward: true,
  game: { select: { slug: true, title: true } },
  category: { select: { slug: true, name: true } },
  _count: { select: { progress: true } },
} satisfies Prisma.DailyChallengeSelect;

type ChallengeRow = Prisma.DailyChallengeGetPayload<{ select: typeof challengeSelect }>;

async function withCompletions(rows: ChallengeRow[]): Promise<AdminChallenge[]> {
  const done = await prisma.userChallengeProgress.groupBy({
    by: ['challengeId'],
    where: { challengeId: { in: rows.map((r) => r.id) }, completedAt: { not: null } },
    _count: { _all: true },
  });
  const completions = new Map(done.map((d) => [d.challengeId, d._count._all]));
  return rows.map((r) => ({
    id: r.id,
    date: dayKey(r.date),
    key: r.key,
    title: r.title,
    description: r.description,
    type: r.type,
    target: r.target,
    xpReward: r.xpReward,
    game: r.game,
    category: r.category,
    participants: r._count.progress,
    completions: completions.get(r.id) ?? 0,
  }));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listChallenges(q: { from?: string; to?: string }): Promise<AdminChallenge[]> {
  const today = dayStart(dayKey(new Date()));
  const from = q.from ? dayStart(q.from) : new Date(today.getTime() - 7 * DAY_MS);
  const to = q.to ? dayStart(q.to) : new Date(today.getTime() + 7 * DAY_MS);
  const rows = await prisma.dailyChallenge.findMany({
    where: { date: { gte: from, lte: to } },
    select: challengeSelect,
    orderBy: [{ date: 'desc' }, { xpReward: 'asc' }],
  });
  return withCompletions(rows);
}

async function resolveRefs(input: { game?: string | null; category?: string | null }) {
  const refs: { gameId?: string | null; categoryId?: string | null } = {};
  if (input.game !== undefined) {
    if (input.game === null) refs.gameId = null;
    else {
      const game = await prisma.game.findUnique({ where: { slug: input.game }, select: { id: true } });
      if (!game) throw fieldError('game', 'Unknown game.');
      refs.gameId = game.id;
    }
  }
  if (input.category !== undefined) {
    if (input.category === null) refs.categoryId = null;
    else {
      const category = await prisma.gameCategory.findUnique({ where: { slug: input.category }, select: { id: true } });
      if (!category) throw fieldError('category', 'Unknown category.');
      refs.categoryId = category.id;
    }
  }
  return refs;
}

async function challengeById(id: string): Promise<AdminChallenge> {
  const row = await prisma.dailyChallenge.findUnique({ where: { id }, select: challengeSelect });
  if (!row) throw notFound('Challenge not found.');
  return (await withCompletions([row]))[0]!;
}

/** Days that have any challenge created here are not filled with automatic ones. */
export async function createChallenge(actor: User, input: ChallengeInput, req: Request): Promise<AdminChallenge> {
  const { game, category, date, ...fields } = input;
  const refs = await resolveRefs({ game: game ?? null, category: category ?? null });
  const row = await prisma.dailyChallenge.create({
    data: { ...fields, ...refs, date: dayStart(date), key: `manual-${randomUUID().slice(0, 8)}` },
    select: { id: true },
  });
  await audit(req, { action: 'admin.challenge_created', actorId: actor.id, targetType: 'challenge', targetId: row.id, metadata: { date, title: input.title } });
  return challengeById(row.id);
}

export async function updateChallenge(actor: User, id: string, input: ChallengeUpdate, req: Request): Promise<AdminChallenge> {
  const existing = await prisma.dailyChallenge.findUnique({ where: { id }, select: { type: true, gameId: true, categoryId: true, date: true } });
  if (!existing) throw notFound('Challenge not found.');
  const { game, category, ...fields } = input;
  const refs = await resolveRefs({ game, category });
  const type = fields.type ?? existing.type;
  const gameId = refs.gameId !== undefined ? refs.gameId : existing.gameId;
  const categoryId = refs.categoryId !== undefined ? refs.categoryId : existing.categoryId;
  if (type === 'REACH_SCORE' && !gameId) throw fieldError('game', 'Choose the game whose score counts');
  if (type === 'PLAY_CATEGORY' && !categoryId) throw fieldError('category', 'Choose a category');
  await prisma.dailyChallenge.update({ where: { id }, data: { ...fields, ...refs } });
  await audit(req, { action: 'admin.challenge_updated', actorId: actor.id, targetType: 'challenge', targetId: id, metadata: { date: dayKey(existing.date), fields: Object.keys(input) } });
  return challengeById(id);
}

export async function deleteChallenge(actor: User, id: string, req: Request): Promise<void> {
  const existing = await prisma.dailyChallenge.findUnique({ where: { id }, select: { date: true, title: true } });
  if (!existing) throw notFound('Challenge not found.');
  const completions = await prisma.userChallengeProgress.count({ where: { challengeId: id, completedAt: { not: null } } });
  if (completions) throw conflict('Players have completed this challenge, so it cannot be deleted.');
  await prisma.dailyChallenge.delete({ where: { id } });
  await audit(req, { action: 'admin.challenge_deleted', actorId: actor.id, targetType: 'challenge', targetId: id, metadata: { date: dayKey(existing.date), title: existing.title } });
}
