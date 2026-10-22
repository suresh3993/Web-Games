import { Router } from 'express';
import type { ApiSuccess, GameSessionResult, GameSessionStart } from '@suresh/shared-types';
import { finishGameSessionSchema, idSchema, startGameSessionSchema, z } from '@suresh/validation';
import { requireAuth, requireVerifiedEmail } from '../../middleware/auth';
import type { RateLimiters } from '../../middleware/rate-limit';
import { audit } from '../audit/audit';
import * as sessions from './sessions.service';

const sessionParams = z.object({ id: idSchema });

export function gameplayRouter(limits: RateLimiters): Router {
  const router = Router();

  // Launching a game requires a logged-in, verified account (checked here, not just in the UI).
  router.post('/', requireAuth, requireVerifiedEmail, limits.gameStart, async (req, res) => {
    const { slug, preview } = startGameSessionSchema.parse(req.body);
    const body: ApiSuccess<GameSessionStart> = { data: await sessions.startSession(req.auth!.user, slug, { preview }) };
    res.status(201).set('Cache-Control', 'no-store').json(body);
  });

  /** Heartbeat: keeps a long round from being treated as abandoned. */
  router.patch('/:id', requireAuth, async (req, res) => {
    const { id } = sessionParams.parse(req.params);
    await sessions.heartbeat(req.auth!.user.id, id);
    res.status(204).end();
  });

  router.post('/:id/finish', requireAuth, limits.scoreSubmit, async (req, res) => {
    const { id } = sessionParams.parse(req.params);
    const input = finishGameSessionSchema.parse(req.body);
    const { result, gameId, flags } = await sessions.finishSession(req.auth!.user, id, input);
    if (flags.length) {
      await audit(req, {
        action: 'score.flagged',
        actorId: req.auth!.user.id,
        targetType: 'game_session',
        targetId: id,
        metadata: { gameId, flags, score: input.score, claimedMs: input.durationMs, acceptedMs: result.durationMs },
      });
    }
    const body: ApiSuccess<GameSessionResult> = { data: result };
    res.set('Cache-Control', 'no-store').json(body);
  });

  return router;
}
