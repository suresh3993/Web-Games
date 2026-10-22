import type { Prisma } from '@prisma/client';
import type { AchievementCriteria, AchievementSummary, MyAchievement, UnlockedAchievement } from '@playverse/shared-types';
import { achievementCriteriaSchema } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { cached, invalidateCache } from '../../lib/cache';
import { logger } from '../../lib/logger';
import { notify } from './notifications.service';
import { categoriesIn, criteriaProgress, isMet, loadSnapshot } from './snapshot';

type Db = Prisma.TransactionClient;

export const achievementSelect = {
  id: true,
  key: true,
  name: true,
  description: true,
  icon: true,
  xpReward: true,
  criteria: true,
  isActive: true,
  createdAt: true,
  game: { select: { slug: true, title: true } },
  _count: { select: { users: true } },
} satisfies Prisma.AchievementSelect;

type AchievementRow = Prisma.AchievementGetPayload<{ select: typeof achievementSelect }>;

/** Criteria are stored as JSON; anything that no longer validates is ignored (and logged), never guessed. */
export function parseCriteria(row: { key: string; criteria: Prisma.JsonValue }): AchievementCriteria | null {
  const parsed = achievementCriteriaSchema.safeParse(row.criteria);
  if (parsed.success) return parsed.data;
  logger.warn({ key: row.key }, 'achievement has invalid criteria; skipped');
  return null;
}

export function toAchievementSummary(a: AchievementRow): AchievementSummary {
  return {
    id: a.id,
    key: a.key,
    name: a.name,
    description: a.description,
    icon: a.icon,
    xpReward: a.xpReward,
    game: a.game,
    unlockedBy: a._count.users,
  };
}

const ORDER: Prisma.AchievementOrderByWithRelationInput[] = [{ xpReward: 'asc' }, { name: 'asc' }];

export function listAchievements(): Promise<AchievementSummary[]> {
  return cached('achievements:public', 60, async () => {
    const rows = await prisma.achievement.findMany({ where: { isActive: true }, select: achievementSelect, orderBy: ORDER });
    return rows.filter((r) => parseCriteria(r)).map(toAchievementSummary);
  });
}

export const invalidateAchievementCache = () => invalidateCache('achievements:');

/** Every active achievement (plus inactive ones already unlocked) with the player's progress. */
export async function myAchievements(userId: string, level: number): Promise<MyAchievement[]> {
  const [rows, unlocks] = await Promise.all([
    prisma.achievement.findMany({
      where: { OR: [{ isActive: true }, { users: { some: { userId } } }] },
      select: achievementSelect,
      orderBy: ORDER,
    }),
    prisma.userAchievement.findMany({ where: { userId }, select: { achievementId: true, unlockedAt: true } }),
  ]);
  const parsed = rows.flatMap((r) => {
    const criteria = parseCriteria(r);
    return criteria ? [{ row: r, criteria }] : [];
  });
  const snapshot = await loadSnapshot(prisma, userId, level, categoriesIn(parsed.map((p) => p.criteria)));
  const unlockedAt = new Map(unlocks.map((u) => [u.achievementId, u.unlockedAt]));
  return parsed.map(({ row, criteria }) => {
    const progress = criteriaProgress(criteria, snapshot);
    const at = unlockedAt.get(row.id) ?? null;
    return {
      ...toAchievementSummary(row),
      unlockedAt: at?.toISOString() ?? null,
      progress: { current: at ? progress.target : Math.min(progress.current, progress.target), target: progress.target },
    };
  });
}

/**
 * Unlocks every active achievement the player now meets. Runs inside the caller's
 * transaction (with the player's row locked). The primary key on UserAchievement and
 * the unique XP source key make unlocks and rewards idempotent.
 */
export async function evaluateAchievements(
  tx: Db,
  userId: string,
  level: number,
): Promise<{ unlocked: (UnlockedAchievement & { id: string })[]; xp: number }> {
  const candidates = await tx.achievement.findMany({
    where: { isActive: true, users: { none: { userId } } },
    select: { id: true, key: true, name: true, description: true, icon: true, xpReward: true, criteria: true },
  });
  const parsed = candidates.flatMap((c) => {
    const criteria = parseCriteria(c);
    return criteria ? [{ ...c, criteria }] : [];
  });
  if (!parsed.length) return { unlocked: [], xp: 0 };

  const snapshot = await loadSnapshot(tx, userId, level, categoriesIn(parsed.map((p) => p.criteria)));
  const met = parsed.filter((p) => isMet(p.criteria, snapshot));
  if (!met.length) return { unlocked: [], xp: 0 };

  await tx.userAchievement.createMany({ data: met.map((m) => ({ userId, achievementId: m.id })), skipDuplicates: true });
  const rewarded = met.filter((m) => m.xpReward > 0);
  if (rewarded.length) {
    await tx.xpTransaction.createMany({
      data: rewarded.map((m) => ({
        userId,
        amount: m.xpReward,
        reason: `Achievement: ${m.name}`.slice(0, 64),
        sourceType: 'achievement',
        sourceId: m.id,
      })),
      skipDuplicates: true,
    });
  }
  await notify(
    tx,
    userId,
    met.map((m) => ({
      type: 'ACHIEVEMENT' as const,
      title: `Achievement unlocked: ${m.name}`,
      body: m.xpReward ? `${m.description} (+${m.xpReward} XP)` : m.description,
      link: '/achievements',
    })),
  );
  return {
    unlocked: met.map((m) => ({ id: m.id, key: m.key, name: m.name, icon: m.icon, xpReward: m.xpReward })),
    xp: rewarded.reduce((sum, m) => sum + m.xpReward, 0),
  };
}
