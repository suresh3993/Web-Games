import express, { Router } from 'express';
import { AVATAR_MAX_BYTES, type ApiSuccess, type CurrentUser, type FavoriteGame, type MyAchievement, type PlayHistoryEntry, type UserProfile } from '@suresh/shared-types';
import { changePasswordSchema, deleteAccountSchema, updateProfileSchema } from '@suresh/validation';
import { requireAuth } from '../../middleware/auth';
import type { RateLimiters } from '../../middleware/rate-limit';
import { toCurrentUser } from '../auth/auth.service';
import { clearSessionCookie } from '../auth/sessions';
import { myAchievements } from '../progression/achievements.service';
import * as account from './account.service';
import * as library from './library.service';

/** Raw image bodies (the client sends the file bytes); the real type is detected from the bytes. */
const imageBody = (limit: number) => express.raw({ type: () => true, limit });

export function usersRouter(limits: RateLimiters): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/me', async (req, res) => {
    const body: ApiSuccess<UserProfile> = { data: await account.getProfile(req.auth!.user) };
    res.set('Cache-Control', 'no-store').json(body);
  });

  router.patch('/me', limits.accountChanges, async (req, res) => {
    const user = await account.updateProfile(req.auth!.user, updateProfileSchema.parse(req.body), req);
    const body: ApiSuccess<CurrentUser> = { data: toCurrentUser(user) };
    res.json(body);
  });

  router.put('/me/avatar', limits.accountChanges, imageBody(AVATAR_MAX_BYTES), async (req, res) => {
    const user = await account.setAvatar(req.auth!.user, req.body as Buffer, req);
    const body: ApiSuccess<CurrentUser> = { data: toCurrentUser(user) };
    res.json(body);
  });

  router.delete('/me/avatar', limits.accountChanges, async (req, res) => {
    const user = await account.removeAvatar(req.auth!.user, req);
    const body: ApiSuccess<CurrentUser> = { data: toCurrentUser(user) };
    res.json(body);
  });

  router.post('/me/password', limits.passwordConfirm, async (req, res) => {
    await account.changePassword(req.auth!.user, req.auth!.sessionId, changePasswordSchema.parse(req.body), req);
    res.status(204).end();
  });

  router.get('/me/export', limits.dataExport, async (req, res) => {
    const data = await account.exportData(req.auth!.user, req);
    const filename = `suresh-data-${new Date().toISOString().slice(0, 10)}.json`;
    res
      .set({ 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="${filename}"` })
      .type('application/json')
      .send(JSON.stringify(data, null, 2));
  });

  router.delete('/me', limits.passwordConfirm, async (req, res) => {
    const { password } = deleteAccountSchema.parse(req.body);
    await account.deleteAccount(req.auth!.user, password, req);
    clearSessionCookie(res);
    res.status(204).end();
  });

  router.get('/me/achievements', async (req, res) => {
    const body: ApiSuccess<MyAchievement[]> = { data: await myAchievements(req.auth!.user.id, req.auth!.user.level) };
    res.set('Cache-Control', 'no-store').json(body);
  });

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
