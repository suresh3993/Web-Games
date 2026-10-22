import type { Request } from 'express';
import type { Prisma, ReportStatus, User } from '@prisma/client';
import type { AdminReport, PaginationMeta } from '@playverse/shared-types';
import type { ReportUpdateInput } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { notFound } from '../../lib/http-error';
import { audit } from '../audit/audit';
import { notify } from '../progression/notifications.service';

const reportSelect = {
  id: true,
  reason: true,
  details: true,
  status: true,
  resolutionNote: true,
  createdAt: true,
  updatedAt: true,
  game: { select: { slug: true, title: true } },
  reporter: { select: { id: true, displayName: true } },
  resolvedBy: { select: { id: true, displayName: true } },
} satisfies Prisma.GameReportSelect;

type ReportRow = Prisma.GameReportGetPayload<{ select: typeof reportSelect }>;

const toReport = (r: ReportRow): AdminReport => ({
  id: r.id,
  game: r.game,
  reporter: r.reporter,
  reason: r.reason,
  details: r.details,
  status: r.status,
  resolutionNote: r.resolutionNote,
  resolvedBy: r.resolvedBy,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

export async function listReports(q: { status?: ReportStatus; page: number; pageSize: number }): Promise<{ items: AdminReport[]; meta: PaginationMeta }> {
  const where: Prisma.GameReportWhereInput = q.status ? { status: q.status } : {};
  const [total, rows] = await prisma.$transaction([
    prisma.gameReport.count({ where }),
    // Open work first, newest first within each status.
    prisma.gameReport.findMany({ where, select: reportSelect, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
  ]);
  return { items: rows.map(toReport), meta: { page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) } };
}

const OUTCOME_TEXT = { RESOLVED: 'resolved', DISMISSED: 'reviewed and closed' } as const;

export async function updateReport(actor: User, id: string, input: ReportUpdateInput, req: Request): Promise<AdminReport> {
  const report = await prisma.gameReport.findUnique({ where: { id }, select: { status: true, reporterId: true, game: { select: { title: true, slug: true } } } });
  if (!report) throw notFound('Report not found.');
  const closing = input.status === 'RESOLVED' || input.status === 'DISMISSED';
  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.gameReport.update({
      where: { id },
      data: {
        status: input.status,
        ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote || null } : {}),
        resolvedById: closing ? actor.id : null,
      },
      select: reportSelect,
    });
    if (closing && report.reporterId && report.status !== input.status) {
      const outcome = OUTCOME_TEXT[input.status as keyof typeof OUTCOME_TEXT];
      await notify(tx, report.reporterId, [
        {
          type: 'MODERATION',
          title: `Your report about ${report.game.title} was ${outcome}`,
          body: input.resolutionNote?.trim() || 'Thanks for helping keep PLAYVERSE in good shape.',
          link: `/games/${report.game.slug}`,
        },
      ]);
    }
    return row;
  });
  await audit(req, {
    action: 'admin.report_updated',
    actorId: actor.id,
    targetType: 'game_report',
    targetId: id,
    metadata: { from: report.status, to: input.status, game: report.game.slug },
  });
  return toReport(updated);
}
