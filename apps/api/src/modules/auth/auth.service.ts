import type { Request } from 'express';
import type { User } from '@prisma/client';
import { Prisma } from '@prisma/client';
import type { CurrentUser } from '@playverse/shared-types';
import type { LoginInput, RegisterInput, ResetPasswordInput } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { HttpError } from '../../lib/http-error';
import { sendMailInBackground } from '../../lib/mailer';
import { audit } from '../audit/audit';
import { accountExistsEmail, passwordChangedEmail, passwordResetEmail, verificationEmail } from './auth.emails';
import { hashPassword, verifyAgainstDummy, verifyPassword } from './password';
import { createSession, revokeAllSessions } from './sessions';
import { consumeAuthToken, issueAuthToken } from './tokens';

export function toCurrentUser(user: User): CurrentUser {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    xp: user.xp,
    level: user.level,
    createdAt: user.createdAt.toISOString(),
  };
}

const requestMeta = (req: Request) => ({ ip: req.ip, userAgent: req.get('user-agent') });

/**
 * Registration never reveals whether an email is already registered: both paths
 * hash the password (similar timing), return the same response, and send an email
 * to the address owner.
 */
export async function register(input: RegisterInput, req: Request): Promise<void> {
  const passwordHash = await hashPassword(input.password);
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    sendMailInBackground(accountExistsEmail(existing.email, existing.displayName));
    await audit(req, { action: 'auth.register_existing_email', targetType: 'user', targetId: existing.id });
    return;
  }

  let user: User;
  try {
    user = await prisma.user.create({
      data: { email: input.email, displayName: input.displayName, passwordHash },
    });
  } catch (err) {
    // Concurrent registration with the same email: behave exactly like the "exists" path.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }
  const token = await issueAuthToken(user.id, 'EMAIL_VERIFICATION');
  sendMailInBackground(verificationEmail(user.email, user.displayName, token));
  await audit(req, { action: 'auth.register', actorId: user.id, targetType: 'user', targetId: user.id });
}

export async function login(input: LoginInput, req: Request) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  const valid = user ? await verifyPassword(user.passwordHash, input.password) : await verifyAgainstDummy(input.password);

  if (!user || !valid) {
    await audit(req, { action: 'auth.login_failed', actorId: user?.id ?? null, targetType: 'user', targetId: user?.id });
    throw new HttpError(401, 'UNAUTHENTICATED', 'Invalid email or password.');
  }
  if (user.status !== 'ACTIVE') {
    await audit(req, { action: 'auth.login_blocked_suspended', actorId: user.id, targetType: 'user', targetId: user.id });
    throw new HttpError(403, 'ACCOUNT_SUSPENDED', 'This account has been suspended. Contact support if you think this is a mistake.');
  }

  const { token, session } = await createSession(user.id, requestMeta(req));
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await audit(req, { action: 'auth.login', actorId: user.id, targetType: 'session', targetId: session.id });
  return { user: updated, token, session };
}

export async function forgotPassword(email: string, req: Request): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') return;
  const token = await issueAuthToken(user.id, 'PASSWORD_RESET');
  sendMailInBackground(passwordResetEmail(user.email, user.displayName, token));
  await audit(req, { action: 'auth.password_reset_requested', actorId: user.id, targetType: 'user', targetId: user.id });
}

export async function resetPassword(input: ResetPasswordInput, req: Request): Promise<void> {
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.$transaction(async (tx) => {
    const userId = await consumeAuthToken(tx, input.token, 'PASSWORD_RESET');
    const current = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    return tx.user.update({
      where: { id: userId },
      // Receiving the reset email proves control of the address.
      data: { passwordHash, emailVerifiedAt: current.emailVerifiedAt ?? new Date() },
    });
  });
  // Revoke every session: anyone holding an old session is signed out.
  await revokeAllSessions(user.id);
  sendMailInBackground(passwordChangedEmail(user.email, user.displayName));
  await audit(req, { action: 'auth.password_reset', actorId: user.id, targetType: 'user', targetId: user.id });
}

export async function verifyEmail(token: string, req: Request): Promise<void> {
  const user = await prisma.$transaction(async (tx) => {
    const userId = await consumeAuthToken(tx, token, 'EMAIL_VERIFICATION');
    return tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  });
  await audit(req, { action: 'auth.email_verified', actorId: user.id, targetType: 'user', targetId: user.id });
}

export async function resendVerification(user: User, req: Request): Promise<void> {
  if (user.emailVerifiedAt) {
    throw new HttpError(409, 'CONFLICT', 'Your email address is already verified.');
  }
  const token = await issueAuthToken(user.id, 'EMAIL_VERIFICATION');
  sendMailInBackground(verificationEmail(user.email, user.displayName, token));
  await audit(req, { action: 'auth.verification_resent', actorId: user.id, targetType: 'user', targetId: user.id });
}
