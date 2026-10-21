import type { AuthTokenType, Prisma } from '@prisma/client';
import { prisma } from '../../database/prisma';
import { generateToken, hashToken } from '../../lib/crypto';
import { HttpError } from '../../lib/http-error';

export const TOKEN_TTL_MS: Record<AuthTokenType, number> = {
  EMAIL_VERIFICATION: 24 * 60 * 60 * 1000,
  PASSWORD_RESET: 60 * 60 * 1000,
};

/** Issues a fresh token and invalidates any older unused tokens of the same type. */
export async function issueAuthToken(userId: string, type: AuthTokenType): Promise<string> {
  const token = generateToken();
  const now = new Date();
  await prisma.$transaction([
    prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: now } }),
    prisma.authToken.create({
      data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + TOKEN_TTL_MS[type]) },
    }),
  ]);
  return token;
}

/**
 * Atomically marks a token as used inside `tx` and returns its user id.
 * The conditional update guarantees single use even under concurrent requests.
 */
export async function consumeAuthToken(tx: Prisma.TransactionClient, token: string, type: AuthTokenType) {
  const invalid = new HttpError(400, 'TOKEN_INVALID', 'This link is invalid or has expired. Please request a new one.');
  const record = await tx.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.type !== type) throw invalid;

  const now = new Date();
  const { count } = await tx.authToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (count !== 1) throw invalid;
  return record.userId;
}
