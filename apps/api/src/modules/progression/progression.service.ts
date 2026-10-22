import type { Prisma } from '@prisma/client';
import { levelForXp, type CompletedChallenge, type DailyChallengeView, type UnlockedAchievement } from '@suresh/shared-types';
import { prisma } from '../../database/prisma';
import { evaluateAchievements } from './achievements.service';
import { challengeForToday, challengeView, dayKey, ensureDailyChallenges, updateChallengeProgress } from './challenges.service';
import { notify } from './notifications.service';

type Db = Prisma.TransactionClient;

export interface ProgressionOutcome {
  achievements: UnlockedAchievement[];
  challengesCompleted: CompletedChallenge[];
  bonusXp: number;
  xp: number;
  level: number;
  leveledUp: boolean;
}

/** Locks the player's row: progression is read-modify-write, so one update per player at a time. */
export const lockPlayer = (tx: Db, userId: string) => tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

/**
 * Applies everything a counted round (or a challenge refresh) can unlock, inside the
 * caller's transaction: daily challenge progress, achievements (repeated while new XP
 * raises the level, so level achievements chain), then one XP/level write and a level-up
 * notification. `xp` must already include any XP the caller awarded in this transaction.
 */
export async function applyProgression(
  tx: Db,
  user: { id: string; xp: number; level: number },
  now: Date,
  options: { challengeIds?: string[] } = {},
): Promise<ProgressionOutcome> {
  let xp = user.xp;
  let level = levelForXp(xp);

  const challenges = await updateChallengeProgress(tx, user.id, now, options.challengeIds);
  xp += challenges.xp;
  level = levelForXp(xp);

  const achievements: UnlockedAchievement[] = [];
  let bonusXp = challenges.xp;
  for (let pass = 0; pass < 4; pass++) {
    const result = await evaluateAchievements(tx, user.id, level);
    if (!result.unlocked.length) break;
    achievements.push(...result.unlocked.map(({ id: _id, ...rest }) => rest));
    xp += result.xp;
    bonusXp += result.xp;
    const next = levelForXp(xp);
    if (next === level) break; // only a level change can unlock more
    level = next;
  }

  const stored = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { xp: true, level: true } });
  if (stored.xp !== xp || stored.level !== level) await tx.user.update({ where: { id: user.id }, data: { xp, level } });
  const leveledUp = level > user.level;
  if (leveledUp) {
    await notify(tx, user.id, [
      { type: 'LEVEL_UP', title: `Level ${level} reached!`, body: `You now have ${xp.toLocaleString('en-US')} XP. Keep playing to reach level ${level + 1}.`, link: '/profile' },
    ]);
  }
  return { achievements, challengesCompleted: challenges.completed, bonusXp, xp, level, leveledUp };
}

/** POST /challenges/:id/progress: recompute one of today's challenges from recorded rounds. */
export async function refreshChallenge(userId: string, challengeId: string): Promise<{ challenge: DailyChallengeView; outcome: ProgressionOutcome }> {
  const now = new Date();
  await ensureDailyChallenges(dayKey(now));
  await challengeForToday(challengeId, now);
  const outcome = await prisma.$transaction(
    async (tx) => {
      await lockPlayer(tx, userId);
      const account = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, xp: true, level: true } });
      return applyProgression(tx, account, now, { challengeIds: [challengeId] });
    },
    { timeout: 15_000 },
  );
  return { challenge: await challengeView(challengeId, userId), outcome };
}
