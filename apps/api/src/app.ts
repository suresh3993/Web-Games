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
import { authRouter } from './modules/auth/auth.routes';
import { gamesRouter } from './modules/games/games.routes';
import { healthRouter } from './modules/health/health.routes';

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

  const v1 = Router();
  v1.use(limits.api);
  v1.use(loadSession);
  v1.use(csrfProtection);
  v1.use('/health', healthRouter());
  v1.use('/auth', authRouter(limits));
  v1.use('/games', gamesRouter());

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
      swaggerUi.setup(openApiDocument, { customSiteTitle: 'PLAYVERSE API' }),
    );
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
