import { Router } from 'express';
import type {
  AchievementSummary,
  ApiPaginated,
  ApiSuccess,
  DailyChallenges,
  DailyChallengeView,
  NotificationItem,
  UnreadCount,
} from '@playverse/shared-types';
import { idSchema, notificationsQuerySchema, z } from '@playverse/validation';
import { requireAuth } from '../../middleware/auth';
import type { RateLimiters } from '../../middleware/rate-limit';
import { listAchievements } from './achievements.service';
import { dailyChallenges } from './challenges.service';
import * as notifications from './notifications.service';
import { refreshChallenge } from './progression.service';

const idParams = z.object({ id: idSchema });

export function achievementsRouter(): Router {
  const router = Router();
  /** Public catalog of achievements (progress for the current player: GET /users/me/achievements). */
  router.get('/', async (_req, res) => {
    const body: ApiSuccess<AchievementSummary[]> = { data: await listAchievements() };
    res.set('Cache-Control', 'public, max-age=60').json(body);
  });
  return router;
}

export function challengesRouter(limits: RateLimiters): Router {
  const router = Router();

  router.get('/daily', async (req, res) => {
    const body: ApiSuccess<DailyChallenges> = { data: await dailyChallenges(req.auth?.user.id ?? null) };
    res.set('Cache-Control', 'private, no-store').json(body);
  });

  /**
   * Recomputes the player's progress on one of today's challenges from their recorded
   * rounds (progress normally updates when a round finishes). The client never supplies
   * progress: there is no amount to send.
   */
  router.post('/:id/progress', requireAuth, limits.accountChanges, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { challenge } = await refreshChallenge(req.auth!.user.id, id);
    const body: ApiSuccess<DailyChallengeView> = { data: challenge };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}

export function notificationsRouter(): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const { items, meta } = await notifications.listNotifications(req.auth!.user.id, notificationsQuerySchema.parse(req.query));
    const body: ApiPaginated<NotificationItem> = { data: items, meta };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.get('/unread-count', async (req, res) => {
    const body: ApiSuccess<UnreadCount> = { data: { unread: await notifications.unreadCount(req.auth!.user.id) } };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.post('/read-all', async (req, res) => {
    await notifications.markAllRead(req.auth!.user.id);
    res.status(204).end();
  });

  router.post('/:id/read', async (req, res) => {
    const { id } = idParams.parse(req.params);
    await notifications.markRead(req.auth!.user.id, id);
    res.status(204).end();
  });

  return router;
}
