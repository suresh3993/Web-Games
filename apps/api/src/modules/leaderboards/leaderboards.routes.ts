import { Router } from 'express';
import type { ApiSuccess, GlobalLeaderboardEntry } from '@playverse/shared-types';
import { z } from '@playverse/validation';
import * as leaderboards from './leaderboards.service';

const globalQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) });

export function leaderboardsRouter(): Router {
  const router = Router();

  /** Players ranked by total XP. */
  router.get('/global', async (req, res) => {
    const { limit } = globalQuery.parse(req.query);
    const body: ApiSuccess<GlobalLeaderboardEntry[]> = { data: await leaderboards.globalLeaderboard(limit, req.auth?.user.id) };
    // `isYou` makes the response viewer-specific.
    res.set('Cache-Control', 'private, no-store').json(body);
  });

  return router;
}
