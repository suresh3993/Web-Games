import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { logger } from '../../lib/logger';

export interface AuditEntry {
  action: string;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
}

/** Records a security-relevant event. Failures are logged but never break the request. */
export async function audit(req: Request | null, entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: entry.action,
        actorId: entry.actorId ?? null,
        targetType: entry.targetType,
        targetId: entry.targetId,
        metadata: entry.metadata ?? {},
        ipAddress: req?.ip?.slice(0, 64),
        userAgent: req?.get('user-agent')?.slice(0, 512),
      },
    });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'failed to write audit log');
  }
}
