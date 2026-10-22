import type { Request } from 'express';
import type { Prisma, Role, User } from '@prisma/client';
import type { AdminUserDetail, AdminUserRow, PaginationMeta } from '@playverse/shared-types';
import type { AdminUsersQuery, UserStatusInput } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { forbidden, HttpError, notFound } from '../../lib/http-error';
import { sendMailInBackground } from '../../lib/mailer';
import { audit } from '../audit/audit';
import { accountSuspendedEmail } from '../auth/auth.emails';
import { revokeAllSessions } from '../auth/sessions';
import { notify } from '../progression/notifications.service';
import { auditSelect, toAuditEntry } from './audit-log.service';

const userRowSelect = {
  id: true,
  email: true,
  displayName: true,
  avatarUrl: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  xp: true,
  level: true,
  createdAt: true,
  lastLoginAt: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userRowSelect }>;

const toRow = (u: UserRow): AdminUserRow => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  avatarUrl: u.avatarUrl,
  role: u.role,
  status: u.status,
  emailVerified: u.emailVerifiedAt !== null,
  xp: u.xp,
  level: u.level,
  createdAt: u.createdAt.toISOString(),
  lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
});

const SORT: Record<AdminUsersQuery['sort'], Prisma.UserOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }],
  oldest: [{ createdAt: 'asc' }],
  name: [{ displayName: 'asc' }],
  xp: [{ xp: 'desc' }, { createdAt: 'asc' }],
  lastLogin: [{ lastLoginAt: { sort: 'desc', nulls: 'last' } }],
};

export async function listUsers(q: AdminUsersQuery): Promise<{ items: AdminUserRow[]; meta: PaginationMeta }> {
  const where: Prisma.UserWhereInput = {
    ...(q.q
      ? { OR: [{ email: { contains: q.q, mode: 'insensitive' } }, { displayName: { contains: q.q, mode: 'insensitive' } }, { id: q.q }] }
      : {}),
    ...(q.role ? { role: q.role } : {}),
    ...(q.status ? { status: q.status } : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: userRowSelect, orderBy: SORT[q.sort], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return { items: rows.map(toRow), meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } };
}

export async function userDetail(id: string): Promise<AdminUserDetail> {
  const user = await prisma.user.findUnique({ where: { id }, select: userRowSelect });
  if (!user) throw notFound('User not found.');
  const [rounds, flaggedScores, reportsFiled, favorites, activeSessions, activity] = await Promise.all([
    prisma.gameSession.count({ where: { userId: id, status: 'FINISHED', preview: false } }),
    prisma.gameScore.count({ where: { userId: id, flagged: true } }),
    prisma.gameReport.count({ where: { reporterId: id } }),
    prisma.userFavorite.count({ where: { userId: id } }),
    prisma.session.count({ where: { userId: id, expiresAt: { gt: new Date() } } }),
    prisma.auditLog.findMany({
      where: { OR: [{ actorId: id }, { targetType: 'user', targetId: id }] },
      orderBy: { createdAt: 'desc' },
      take: 25,
      select: auditSelect,
    }),
  ]);
  return { ...toRow(user), stats: { rounds, flaggedScores, reportsFiled, favorites, activeSessions }, recentActivity: activity.map(toAuditEntry) };
}

const otherActiveAdmins = (excludeId: string) => prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', id: { not: excludeId } } });

/**
 * Suspends or reactivates an account. Nobody can change their own status; moderators
 * may only act on regular users; the last active admin cannot be suspended. Suspension
 * signs the person out everywhere.
 */
export async function setStatus(actor: User, id: string, input: UserStatusInput, req: Request): Promise<AdminUserRow> {
  if (actor.id === id) throw forbidden('You cannot change the status of your own account.');
  const target = await prisma.user.findUnique({ where: { id }, select: userRowSelect });
  if (!target) throw notFound('User not found.');
  if (actor.role === 'MODERATOR' && target.role !== 'USER') throw forbidden('Moderators can only suspend or reactivate regular players.');
  if (target.status === input.status) return toRow(target);
  if (input.status === 'SUSPENDED' && target.role === 'ADMIN' && (await otherActiveAdmins(id)) === 0) {
    throw new HttpError(409, 'CONFLICT', 'This is the last active administrator and cannot be suspended.');
  }

  const updated = await prisma.user.update({ where: { id }, data: { status: input.status }, select: userRowSelect });
  if (input.status === 'SUSPENDED') {
    await revokeAllSessions(id);
    sendMailInBackground(accountSuspendedEmail(target.email, target.displayName, input.reason));
  }
  await audit(req, {
    action: input.status === 'SUSPENDED' ? 'admin.user_suspended' : 'admin.user_reactivated',
    actorId: actor.id,
    targetType: 'user',
    targetId: id,
    metadata: { reason: input.reason, targetRole: target.role },
  });
  return toRow(updated);
}

const ROLE_NAMES: Record<Role, string> = { USER: 'Player', MODERATOR: 'Moderator', ADMIN: 'Administrator' };

/**
 * Changes another account's role (admins only, enforced by the route). Nobody can change
 * their own role, so no one can promote themselves; the last admin cannot be demoted.
 */
export async function setRole(actor: User, id: string, role: Role, req: Request): Promise<AdminUserRow> {
  if (actor.id === id) throw forbidden('You cannot change your own role.');
  const target = await prisma.user.findUnique({ where: { id }, select: userRowSelect });
  if (!target) throw notFound('User not found.');
  if (target.role === role) return toRow(target);
  if (target.role === 'ADMIN' && (await otherActiveAdmins(id)) === 0) {
    throw new HttpError(409, 'CONFLICT', 'This is the last active administrator and cannot be demoted.');
  }
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.user.update({ where: { id }, data: { role }, select: userRowSelect });
    await notify(tx, id, [
      { type: 'SYSTEM', title: 'Your role changed', body: `An administrator changed your role to ${ROLE_NAMES[role]}.`, link: role === 'USER' ? '/profile' : '/admin' },
    ]);
    return next;
  });
  await audit(req, { action: 'admin.user_role_changed', actorId: actor.id, targetType: 'user', targetId: id, metadata: { from: target.role, to: role } });
  return toRow(updated);
}
