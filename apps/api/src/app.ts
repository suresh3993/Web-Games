import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router, type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { openApiDocument } from './docs/openapi';
import { logger } from './lib/logger';
import { loadSession } from './middleware/auth';
import { csrfProtection } from './middleware/csrf';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { createRateLimiters } from './middleware/rate-limit';
import { adminRouter } from './modules/admin/admin.routes';
import { authRouter } from './modules/auth/auth.routes';
import { gameplayRouter } from './modules/gameplay/gameplay.routes';
import { gamesRouter } from './modules/games/games.routes';
import { healthRouter } from './modules/health/health.routes';
import { leaderboardsRouter } from './modules/leaderboards/leaderboards.routes';
import { mediaRouter } from './modules/media/media.routes';
import { achievementsRouter, challengesRouter, notificationsRouter } from './modules/progression/progression.routes';
import { usersRouter } from './modules/users/users.routes';

export function createApp(): Express {
  const app = express();
  const limits = createRateLimiters();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);
  // Strict JSON API; the docs UI gets a slightly relaxed policy below.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-origin' },
    }),
  );
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      autoLogging: { ignore: (req) => req.url === '/api/v1/health' },
    }),
  );
  app.use(
    cors({
      origin: (origin, cb) => cb(null, !origin || env.corsOrigins.includes(origin)),
      credentials: true,
      allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Uploaded images: public, immutable and browser-cached; a separate, larger budget than the API.
  app.use('/api/v1/media', limits.media, mediaRouter());

  const v1 = Router();
  v1.use(limits.api);
  v1.use(loadSession);
  v1.use(csrfProtection);
  v1.use('/health', healthRouter());
  v1.use('/auth', authRouter(limits));
  v1.use('/games', gamesRouter(limits));
  v1.use('/game-sessions', gameplayRouter(limits));
  v1.use('/leaderboards', leaderboardsRouter());
  v1.use('/users', usersRouter(limits));
  v1.use('/achievements', achievementsRouter());
  v1.use('/challenges', challengesRouter(limits));
  v1.use('/notifications', notificationsRouter());
  v1.use('/admin', adminRouter(limits));

  app.use('/api/v1', v1);

  if (env.apiDocsEnabled) {
    app.get('/api/v1/openapi.json', (_req, res) => res.json(openApiDocument));
    app.use(
      '/api/docs',
      helmet.contentSecurityPolicy({
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          frameAncestors: ["'none'"],
        },
      }),
      swaggerUi.serve,
      swaggerUi.setup(openApiDocument, { customSiteTitle: 'SURESH API' }),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
