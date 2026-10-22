import type { Prisma } from '@prisma/client';
import type { AuditLogEntry, PaginationMeta } from '@suresh/shared-types';
import type { AuditLogQuery } from '@suresh/validation';
import { prisma } from '../../database/prisma';

export const auditSelect = {
  id: true,
  action: true,
  targetType: true,
  targetId: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  actor: { select: { id: true, displayName: true, email: true } },
} satisfies Prisma.AuditLogSelect;

type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>;

export const toAuditEntry = (a: AuditRow): AuditLogEntry => ({
  id: a.id,
  action: a.action,
  actor: a.actor,
  targetType: a.targetType,
  targetId: a.targetId,
  metadata: (a.metadata ?? {}) as Record<string, unknown>,
  ipAddress: a.ipAddress,
  userAgent: a.userAgent,
  createdAt: a.createdAt.toISOString(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

export async function listAuditLogs(q: AuditLogQuery): Promise<{ items: AuditLogEntry[]; meta: PaginationMeta }> {
  const where: Prisma.AuditLogWhereInput = {
    ...(q.action ? { action: { startsWith: q.action } } : {}),
    ...(q.actorId ? { actorId: q.actorId } : {}),
    ...(q.targetType ? { targetType: q.targetType } : {}),
    ...(q.targetId ? { targetId: q.targetId } : {}),
    ...(q.from || q.to
      ? {
          createdAt: {
            ...(q.from ? { gte: new Date(`${q.from}T00:00:00.000Z`) } : {}),
            ...(q.to ? { lt: new Date(new Date(`${q.to}T00:00:00.000Z`).getTime() + DAY_MS) } : {}),
          },
        }
      : {}),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, select: auditSelect, orderBy: { createdAt: 'desc' }, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return { items: rows.map(toAuditEntry), meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } };
}
