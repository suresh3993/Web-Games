import type { RequestHandler } from 'express';
import type { Role } from '@suresh/shared-types';
import { forbidden, HttpError, unauthenticated } from '../lib/http-error';
import { clearSessionCookie, resolveSession, SESSION_COOKIE, setSessionCookie } from '../modules/auth/sessions';

/** Attaches `req.auth` when a valid session cookie is present. Never rejects. */
export const loadSession: RequestHandler = async (req, res, next) => {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || !token) return next();

  const result = await resolveSession(token);
  if (!result) {
    clearSessionCookie(res);
    return next();
  }
  req.auth = { user: result.user, sessionId: result.session.id };
  if (result.refreshed) setSessionCookie(res, token, result.session.expiresAt);
  next();
};

/** Server-side authentication guard. */
export const requireAuth: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw unauthenticated();
  next();
};

/** Server-side role guard. Admin implies moderator permissions. */
export function requireRole(...roles: Role[]): RequestHandler {
  const allowed = new Set<Role>(roles.includes('MODERATOR') ? [...roles, 'ADMIN'] : roles);
  return (req, _res, next) => {
    if (!req.auth) throw unauthenticated();
    if (!allowed.has(req.auth.user.role)) throw forbidden();
    next();
  };
}

export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!req.auth) throw unauthenticated();
  if (!req.auth.user.emailVerifiedAt) {
    throw new HttpError(403, 'FORBIDDEN', 'Please verify your email address first.');
  }
  next();
};
