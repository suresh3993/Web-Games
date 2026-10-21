import { Router } from 'express';
import type { ApiSuccess, FavoriteGame, PlayHistoryEntry } from '@playverse/shared-types';
import { requireAuth } from '../../middleware/auth';
import * as library from './library.service';

export function usersRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/me/favorites', async (req, res) => {
    const body: ApiSuccess<FavoriteGame[]> = { data: await library.listFavorites(req.auth!.user.id) };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/me/history', async (req, res) => {
    const body: ApiSuccess<PlayHistoryEntry[]> = { data: await library.playHistory(req.auth!.user.id) };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
