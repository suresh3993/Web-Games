import type { Prisma } from '@prisma/client';
import type { NotificationItem, NotificationType, PaginationMeta } from '@playverse/shared-types';
import type { NotificationsQuery } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { notFound } from '../../lib/http-error';

type Db = Prisma.TransactionClient;

export interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
}

/** Notifications older than this are pruned when new ones are written. */
const KEEP_PER_USER = 200;

export async function notify(db: Db, userId: string, notifications: NewNotification[]): Promise<void> {
  if (!notifications.length) return;
  await db.notification.createMany({
    data: notifications.map((n) => ({ userId, type: n.type, title: n.title.slice(0, 120), body: n.body.slice(0, 500), link: n.link ?? null })),
  });
  // Bound storage per user: keep the newest KEEP_PER_USER.
  const stale = await db.notification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    skip: KEEP_PER_USER,
    select: { id: true },
  });
  if (stale.length) await db.notification.deleteMany({ where: { id: { in: stale.map((n) => n.id) } } });
}

const toItem = (n: { id: string; type: NotificationType; title: string; body: string; link: string | null; readAt: Date | null; createdAt: Date }): NotificationItem => ({
  id: n.id,
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

export async function listNotifications(userId: string, query: NotificationsQuery): Promise<{ items: NotificationItem[]; meta: PaginationMeta }> {
  const where = { userId, ...(query.unread ? { readAt: null } : {}) };
  const [total, rows] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  return {
    items: rows.map(toItem),
    meta: { page: query.page, pageSize: query.pageSize, total, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) },
  };
}

export const unreadCount = (userId: string) => prisma.notification.count({ where: { userId, readAt: null } });

export async function markRead(userId: string, id: string): Promise<void> {
  const { count } = await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  if (count) return;
  // Already read is fine (idempotent); someone else's or unknown is a 404.
  if (!(await prisma.notification.count({ where: { id, userId } }))) throw notFound('Notification not found.');
}

export async function markAllRead(userId: string): Promise<number> {
  const { count } = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return count;
}
