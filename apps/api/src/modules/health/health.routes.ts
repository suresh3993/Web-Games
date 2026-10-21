import { Router } from 'express';
import type { ApiSuccess, HealthResponse } from '@playverse/shared-types';
import { prisma } from '../../database/prisma';
import { redisHealthy } from '../../lib/redis';

export function healthRouter(): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    const database = await prisma.$queryRaw`SELECT 1`.then(
      () => 'ok' as const,
      () => 'error' as const,
    );
    const redis = await redisHealthy();
    const healthy = database === 'ok' && redis !== 'error';
    const body: ApiSuccess<HealthResponse> = {
      data: { status: healthy ? 'ok' : 'degraded', uptimeSeconds: Math.round(process.uptime()), checks: { database, redis } },
    };
    res.status(healthy ? 200 : 503).set('Cache-Control', 'no-store').json(body);
  });
  return router;
}
