import type { CookieOptions, Response } from 'express';
import type { Session, User } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../database/prisma';
import { generateToken, hashToken } from '../../lib/crypto';

/** `__Host-` prefix pins the cookie to this exact host over HTTPS (no Domain, Path=/). */
export const SESSION_COOKIE = env.cookieSecure ? '__Host-pv_session' : 'pv_session';

/** Sessions slide with activity but never outlive this absolute cap. */
const ABSOLUTE_MAX_MS = 30 * 24 * 60 * 60 * 1000;
/** Avoid a DB write on every request: refresh at most this often. */
const REFRESH_AFTER_MS = 5 * 60 * 1000;

const baseCookie: CookieOptions = {
  httpOnly: true,
  secure: env.cookieSecure,
  sameSite: 'lax',
  path: '/',
};

export function setSessionCookie(res: Response, token: string, expiresAt: Date) {
  res.cookie(SESSION_COOKIE, token, { ...baseCookie, expires: expiresAt });
}

export function clearSessionCookie(res: Response) {
  res.clearCookie(SESSION_COOKIE, baseCookie);
}

export async function createSession(userId: string, meta: { ip?: string; userAgent?: string }) {
  const token = generateToken();
  const session = await prisma.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      ipAddress: meta.ip?.slice(0, 64),
      userAgent: meta.userAgent?.slice(0, 512),
      expiresAt: new Date(Date.now() + env.sessionTtlMs),
    },
  });
  return { token, session };
}

export async function resolveSession(
  token: string,
): Promise<{ session: Session; user: User; refreshed: boolean } | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  const now = Date.now();
  if (session.expiresAt.getTime() <= now || session.user.status !== 'ACTIVE') {
    await prisma.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  const { user, ...rest } = session;
  if (now - session.lastSeenAt.getTime() < REFRESH_AFTER_MS) {
    return { session: rest, user, refreshed: false };
  }
  const expiresAt = new Date(Math.min(now + env.sessionTtlMs, session.createdAt.getTime() + ABSOLUTE_MAX_MS));
  const updated = await prisma.session.update({
    where: { id: session.id },
    data: { lastSeenAt: new Date(now), expiresAt },
  });
  return { session: updated, user, refreshed: true };
}

export const revokeSession = (sessionId: string) => prisma.session.deleteMany({ where: { id: sessionId } });

export const revokeAllSessions = (userId: string) => prisma.session.deleteMany({ where: { userId } });
