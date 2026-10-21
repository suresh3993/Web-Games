import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './database/prisma';
import { logger } from './lib/logger';
import { flushMail } from './lib/mailer';
import { redis } from './lib/redis';

const app = createApp();
const server = app.listen(env.port, () => {
  logger.info(`PLAYVERSE API listening on http://localhost:${env.port} (${env.nodeEnv})`);
  if (env.apiDocsEnabled) logger.info(`API docs: http://localhost:${env.port}/api/docs`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'shutting down');
  server.close();
  await Promise.allSettled([flushMail(), prisma.$disconnect(), redis?.quit()]);
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled promise rejection'));
