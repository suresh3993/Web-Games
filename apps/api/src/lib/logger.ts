import { pino } from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.logLevel,
  base: { service: 'suresh-api' },
  // Never log credentials, cookies or tokens.
  redact: {
    paths: [
      'req.headers.cookie',
      'req.headers.authorization',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.token',
    ],
    censor: '[redacted]',
  },
});
