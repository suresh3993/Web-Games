import { Router, type Response } from 'express';
import type {
  ApiPaginated,
  ApiSuccess,
  CategorySummary,
  GameDetail,
  GameSummary,
  Leaderboard,
  MessageResponse,
  MyGameStats,
} from '@playverse/shared-types';
import { gameReportSchema, leaderboardQuerySchema, listGamesQuerySchema, slugSchema } from '@playverse/validation';
import { requireAuth } from '../../middleware/auth';
import type { RateLimiters } from '../../middleware/rate-limit';
import { audit } from '../audit/audit';
import * as leaderboards from '../leaderboards/leaderboards.service';
import { reportGame } from '../reports/reports.service';
import * as library from '../users/library.service';
import * as games from './games.service';

/** Catalog responses are public and user-agnostic, so shared caches may store them briefly. */
const publicCache = (res: Response, seconds = 60) =>
  res.set('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);
const noStore = (res: Response) => res.set('Cache-Control', 'private, no-store');

export function gamesRouter(limits: RateLimiters): Router {
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

  router.get('/:slug/leaderboard', async (req, res) => {
    const slug = slugSchema.parse(req.params.slug);
    const { period, limit } = leaderboardQuerySchema.parse(req.query);
    const game = await games.requirePublicGame(slug);
    const body: ApiSuccess<Leaderboard> = {
      data: await leaderboards.gameLeaderboard(game.id, period, limit, req.auth?.user.id),
    };
    // `isYou` makes the response viewer-specific; the rows themselves are cached server-side.
    noStore(res).json(body);
  });

  /** The current player's stats for one game (best, plays, rank, favourite). */
  router.get('/:slug/me', requireAuth, async (req, res) => {
    const body: ApiSuccess<MyGameStats> = {
      data: await library.myGameStats(req.auth!.user.id, slugSchema.parse(req.params.slug)),
    };
    noStore(res).json(body);
  });

  router.post('/:slug/favorite', requireAuth, async (req, res) => {
    await library.addFavorite(req.auth!.user.id, slugSchema.parse(req.params.slug));
    res.status(204).end();
  });

  router.delete('/:slug/favorite', requireAuth, async (req, res) => {
    await library.removeFavorite(req.auth!.user.id, slugSchema.parse(req.params.slug));
    res.status(204).end();
  });

  router.post('/:slug/reports', requireAuth, limits.reports, async (req, res) => {
    const slug = slugSchema.parse(req.params.slug);
    const input = gameReportSchema.parse(req.body);
    const { id, created } = await reportGame(req.auth!.user.id, slug, input);
    if (created) {
      await audit(req, { action: 'game.reported', actorId: req.auth!.user.id, targetType: 'game_report', targetId: id, metadata: { slug, reason: input.reason } });
    }
    const body: ApiSuccess<MessageResponse> = { data: { message: 'Thanks! Our moderators will look into it.' } };
    res.status(202).json(body);
  });

  return router;
}
