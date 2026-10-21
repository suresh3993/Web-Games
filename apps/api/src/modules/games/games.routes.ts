import { Router, type Response } from 'express';
import type { ApiPaginated, ApiSuccess, CategorySummary, GameDetail, GameSummary } from '@playverse/shared-types';
import { listGamesQuerySchema, slugSchema } from '@playverse/validation';
import * as games from './games.service';

/** Catalog responses are public and user-agnostic, so shared caches may store them briefly. */
const publicCache = (res: Response, seconds = 60) =>
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);

export function gamesRouter(): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { items, meta } = await games.listGames(listGamesQuerySchema.parse(req.query));
    const body: ApiPaginated<GameSummary> = { data: items, meta };
    publicCache(res, 30).json(body);
  });

  // Static paths are registered before "/:slug" so they are never treated as slugs.
  router.get('/featured', async (_req, res) => {
    const body: ApiSuccess<GameSummary[]> = { data: await games.featuredGames() };
    publicCache(res).json(body);
  });

  router.get('/trending', async (_req, res) => {
    const body: ApiSuccess<GameSummary[]> = { data: await games.trendingGames() };
    publicCache(res).json(body);
  });

  router.get('/categories', async (_req, res) => {
    const body: ApiSuccess<CategorySummary[]> = { data: await games.listCategories() };
    publicCache(res, 300).json(body);
  });

  router.get('/:slug', async (req, res) => {
    const body: ApiSuccess<GameDetail> = { data: await games.getGameBySlug(slugSchema.parse(req.params.slug)) };
    publicCache(res).json(body);
  });

  router.get('/:slug/related', async (req, res) => {
    const body: ApiSuccess<GameSummary[]> = { data: await games.relatedGames(slugSchema.parse(req.params.slug)) };
    publicCache(res).json(body);
  });

  return router;
}
