import type { GameReportInput } from '@suresh/validation';
import { prisma } from '../../database/prisma';
import { requirePublicGame } from '../games/games.service';

/**
 * Files a player report about a game (broken, inappropriate, cheating…).
 * A repeat of an identical open report from the same player is absorbed, not duplicated.
 */
export async function reportGame(userId: string, slug: string, input: GameReportInput): Promise<{ id: string; created: boolean }> {
  const game = await requirePublicGame(slug);
  const open = await prisma.gameReport.findFirst({
    where: { gameId: game.id, reporterId: userId, reason: input.reason, status: { in: ['OPEN', 'IN_REVIEW'] } },
    select: { id: true },
  });
  if (open) return { id: open.id, created: false };
  const report = await prisma.gameReport.create({
    data: { gameId: game.id, reporterId: userId, reason: input.reason, details: input.details },
    select: { id: true },
  });
  return { id: report.id, created: true };
}
