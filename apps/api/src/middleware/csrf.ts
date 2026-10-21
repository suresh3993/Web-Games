import type { CookieOptions, Request, RequestHandler, Response } from 'express';
import { env } from '../config/env';
import { generateToken, safeEqual } from '../lib/crypto';
import { HttpError } from '../lib/http-error';

/**
 * CSRF defence for cookie-authenticated requests (defence in depth on top of SameSite=Lax):
 *  1. Origin allowlist — unsafe requests carrying a foreign Origin are rejected.
 *  2. Double-submit token — unsafe requests must send `X-CSRF-Token` equal to the
 *     HttpOnly CSRF cookie. The token is obtained from GET /api/v1/auth/csrf, which a
 *     foreign origin cannot read because CORS does not allow it.
 */
export const CSRF_COOKIE = env.cookieSecure ? '__Host-pv_csrf' : 'pv_csrf';
export const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const cookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax',
  path: '/',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

export function issueCsrfToken(req: Request, res: Response): string {
  const existing = req.cookies?.[CSRF_COOKIE];
  const token = typeof existing === 'string' && /^[A-Za-z0-9_-]{43}$/.test(existing) ? existing : generateToken();
  res.cookie(CSRF_COOKIE, token, cookieOptions);
  return token;
}

export const csrfProtection: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  if (origin && !env.corsOrigins.includes(origin)) {
    throw new HttpError(403, 'CSRF_INVALID', 'Request origin is not allowed.');
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);
  if (typeof cookieToken !== 'string' || !headerToken || !safeEqual(cookieToken, headerToken)) {
    throw new HttpError(403, 'CSRF_INVALID', 'Your security token is missing or expired. Please refresh and try again.');
  }
  next();
};
