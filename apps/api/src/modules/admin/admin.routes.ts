import express, { Router, type Response } from 'express';
import {
  THUMBNAIL_MAX_BYTES,
  type AdminAchievement,
  type AdminCategory,
  type AdminChallenge,
  type AdminDashboard,
  type AdminGameDetail,
  type AdminGameRow,
  type AdminReport,
  type AdminUserDetail,
  type AdminUserRow,
  type ApiPaginated,
  type ApiSuccess,
  type AuditLogEntry,
} from '@playverse/shared-types';
import {
  achievementInputSchema,
  achievementUpdateSchema,
  adminGameCreateSchema,
  adminGamesQuerySchema,
  adminGameUpdateSchema,
  adminReportsQuerySchema,
  adminUsersQuerySchema,
  auditLogQuerySchema,
  categoryInputSchema,
  categoryUpdateSchema,
  challengeInputSchema,
  challengesQuerySchema,
  challengeUpdateSchema,
  idSchema,
  reportUpdateSchema,
  userRoleSchema,
  userStatusSchema,
  z,
} from '@playverse/validation';
import { requireRole } from '../../middleware/auth';
import type { RateLimiters } from '../../middleware/rate-limit';
import { listAuditLogs } from './audit-log.service';
import * as catalog from './catalog.service';
import * as content from './content.service';
import { dashboard } from './dashboard.service';
import * as moderation from './moderation.service';
import * as users from './users.service';

const idParams = z.object({ id: idSchema });
const noStore = (res: Response) => res.set('Cache-Control', 'private, no-store');

/**
 * Administration API. Every route requires a staff role on the server:
 *  - MODERATOR (and ADMIN): dashboard, user moderation (regular players only), reports, read-only catalog.
 *  - ADMIN only: roles, catalog and category changes, achievements, challenges, audit log.
 */
export function adminRouter(limits: RateLimiters): Router {
  const router = Router();
  const admin = requireRole('ADMIN');
  router.use(requireRole('MODERATOR'));
  router.use((req, res, next) => {
    noStore(res);
    // Throttle staff writes per account (reads are covered by the global limit).
    if (req.method === 'GET') return next();
    return limits.adminWrites(req, res, next);
  });

  router.get('/dashboard', async (_req, res) => {
    const body: ApiSuccess<AdminDashboard> = { data: await dashboard() };
    res.json(body);
  });

  // ---- users -----------------------------------------------------------------------
  router.get('/users', async (req, res) => {
    const { items, meta } = await users.listUsers(adminUsersQuerySchema.parse(req.query));
    const body: ApiPaginated<AdminUserRow> = { data: items, meta };
    res.json(body);
  });
  router.get('/users/:id', async (req, res) => {
    const body: ApiSuccess<AdminUserDetail> = { data: await users.userDetail(idParams.parse(req.params).id) };
    res.json(body);
  });
  router.patch('/users/:id/status', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body: ApiSuccess<AdminUserRow> = { data: await users.setStatus(req.auth!.user, id, userStatusSchema.parse(req.body), req) };
    res.json(body);
  });
  router.patch('/users/:id/role', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const { role } = userRoleSchema.parse(req.body);
    const body: ApiSuccess<AdminUserRow> = { data: await users.setRole(req.auth!.user, id, role, req) };
    res.json(body);
  });

  // ---- reports -----------------------------------------------------------------------
  router.get('/reports', async (req, res) => {
    const { items, meta } = await moderation.listReports(adminReportsQuerySchema.parse(req.query));
    const body: ApiPaginated<AdminReport> = { data: items, meta };
    res.json(body);
  });
  router.patch('/reports/:id', async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body: ApiSuccess<AdminReport> = { data: await moderation.updateReport(req.auth!.user, id, reportUpdateSchema.parse(req.body), req) };
    res.json(body);
  });

  // ---- games ---------------------------------------------------------------------------
  router.get('/games', async (req, res) => {
    const { items, meta } = await catalog.listGames(adminGamesQuerySchema.parse(req.query));
    const body: ApiPaginated<AdminGameRow> = { data: items, meta };
    res.json(body);
  });
  router.get('/games/:id', async (req, res) => {
    const body: ApiSuccess<AdminGameDetail> = { data: await catalog.gameDetail(idParams.parse(req.params).id) };
    res.json(body);
  });
  router.post('/games', admin, async (req, res) => {
    const body: ApiSuccess<AdminGameDetail> = { data: await catalog.createGame(req.auth!.user, adminGameCreateSchema.parse(req.body), req) };
    res.status(201).json(body);
  });
  router.patch('/games/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body: ApiSuccess<AdminGameDetail> = { data: await catalog.updateGame(req.auth!.user, id, adminGameUpdateSchema.parse(req.body), req) };
    res.json(body);
  });
  router.delete('/games/:id', admin, async (req, res) => {
    await catalog.deleteGame(req.auth!.user, idParams.parse(req.params).id, req);
    res.status(204).end();
  });
  router.put('/games/:id/thumbnail', admin, express.raw({ type: () => true, limit: THUMBNAIL_MAX_BYTES }), async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body: ApiSuccess<AdminGameDetail> = { data: await catalog.setThumbnail(req.auth!.user, id, req.body as Buffer, req) };
    res.json(body);
  });
  router.delete('/games/:id/thumbnail', admin, async (req, res) => {
    const body: ApiSuccess<AdminGameDetail> = { data: await catalog.removeThumbnail(req.auth!.user, idParams.parse(req.params).id, req) };
    res.json(body);
  });

  // ---- categories ------------------------------------------------------------------------
  router.get('/categories', async (_req, res) => {
    const body: ApiSuccess<AdminCategory[]> = { data: await catalog.listCategories() };
    res.json(body);
  });
  router.post('/categories', admin, async (req, res) => {
    const body: ApiSuccess<AdminCategory> = { data: await catalog.createCategory(req.auth!.user, categoryInputSchema.parse(req.body), req) };
    res.status(201).json(body);
  });
  router.patch('/categories/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body: ApiSuccess<AdminCategory> = { data: await catalog.updateCategory(req.auth!.user, id, categoryUpdateSchema.parse(req.body), req) };
    res.json(body);
  });
  router.delete('/categories/:id', admin, async (req, res) => {
    await catalog.deleteCategory(req.auth!.user, idParams.parse(req.params).id, req);
    res.status(204).end();
  });

  // ---- achievements ------------------------------------------------------------------------
  router.get('/achievements', admin, async (_req, res) => {
    const body: ApiSuccess<AdminAchievement[]> = { data: await content.listAchievements() };
    res.json(body);
  });
  router.post('/achievements', admin, async (req, res) => {
    const body: ApiSuccess<AdminAchievement> = { data: await content.createAchievement(req.auth!.user, achievementInputSchema.parse(req.body), req) };
    res.status(201).json(body);
  });
  router.patch('/achievements/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body: ApiSuccess<AdminAchievement> = { data: await content.updateAchievement(req.auth!.user, id, achievementUpdateSchema.parse(req.body), req) };
    res.json(body);
  });
  router.delete('/achievements/:id', admin, async (req, res) => {
    await content.deleteAchievement(req.auth!.user, idParams.parse(req.params).id, req);
    res.status(204).end();
  });

  // ---- daily challenges ----------------------------------------------------------------------
  router.get('/challenges', admin, async (req, res) => {
    const body: ApiSuccess<AdminChallenge[]> = { data: await content.listChallenges(challengesQuerySchema.parse(req.query)) };
    res.json(body);
  });
  router.post('/challenges', admin, async (req, res) => {
    const body: ApiSuccess<AdminChallenge> = { data: await content.createChallenge(req.auth!.user, challengeInputSchema.parse(req.body), req) };
    res.status(201).json(body);
  });
  router.patch('/challenges/:id', admin, async (req, res) => {
    const { id } = idParams.parse(req.params);
    const body: ApiSuccess<AdminChallenge> = { data: await content.updateChallenge(req.auth!.user, id, challengeUpdateSchema.parse(req.body), req) };
    res.json(body);
  });
  router.delete('/challenges/:id', admin, async (req, res) => {
    await content.deleteChallenge(req.auth!.user, idParams.parse(req.params).id, req);
    res.status(204).end();
  });

  // ---- audit log ---------------------------------------------------------------------------
  router.get('/audit-logs', admin, async (req, res) => {
    const { items, meta } = await listAuditLogs(auditLogQuerySchema.parse(req.query));
    const body: ApiPaginated<AuditLogEntry> = { data: items, meta };
    res.json(body);
  });

  return router;
}
