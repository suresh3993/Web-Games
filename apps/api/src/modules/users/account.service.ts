import type { Request } from 'express';
import type { User } from '@prisma/client';
import { AVATAR_MAX_BYTES, xpForLevel, type UserProfile } from '@playverse/shared-types';
import type { ChangePasswordInput, UpdateProfileInput } from '@playverse/validation';
import { prisma } from '../../database/prisma';
import { HttpError } from '../../lib/http-error';
import { processImage } from '../../lib/images';
import { sendMailInBackground } from '../../lib/mailer';
import { audit } from '../audit/audit';
import { accountDeletedEmail, passwordChangedEmail } from '../auth/auth.emails';
import { hashPassword, verifyPassword } from '../auth/password';
import { toCurrentUser } from '../auth/auth.service';
import { defaultMediaUrl, storeImage } from '../media/media.service';
import { loadSnapshot } from '../progression/snapshot';

export async function getProfile(user: User): Promise<UserProfile> {
  const [snapshot, unlocked, total, better] = await Promise.all([
    loadSnapshot(prisma, user.id, user.level),
    prisma.userAchievement.count({ where: { userId: user.id } }),
    prisma.achievement.count({ where: { isActive: true } }),
    user.xp > 0 ? prisma.user.count({ where: { status: 'ACTIVE', xp: { gt: user.xp } } }) : Promise.resolve(null),
  ]);
  return {
    user: toCurrentUser(user),
    stats: {
      rounds: snapshot.rounds,
      gamesPlayed: snapshot.distinctGames,
      playTimeMs: snapshot.playMs,
      wins: snapshot.wins,
      achievementsUnlocked: unlocked,
      achievementsTotal: total,
      challengesCompleted: snapshot.challengesCompleted,
      globalRank: better === null ? null : better + 1,
      levelStartXp: xpForLevel(user.level),
      nextLevelXp: xpForLevel(user.level + 1),
    },
  };
}

export async function updateProfile(user: User, input: UpdateProfileInput, req: Request): Promise<User> {
  if (input.displayName === user.displayName) return user;
  const updated = await prisma.user.update({ where: { id: user.id }, data: { displayName: input.displayName } });
  await audit(req, {
    action: 'user.profile_updated',
    actorId: user.id,
    targetType: 'user',
    targetId: user.id,
    metadata: { displayName: { from: user.displayName, to: input.displayName } },
  });
  return updated;
}

/** Replaces the avatar with a server re-encoded copy of the upload; the previous image is deleted. */
export async function setAvatar(user: User, bytes: Buffer, req: Request): Promise<User> {
  const variants = await processImage(bytes, 'avatar', AVATAR_MAX_BYTES);
  const updated = await prisma.$transaction(async (tx) => {
    const imageId = await storeImage(tx, 'avatar', user.id, variants);
    const next = await tx.user.update({
      where: { id: user.id },
      data: { avatarImageId: imageId, avatarUrl: defaultMediaUrl(imageId, 'avatar') },
    });
    if (user.avatarImageId) await tx.mediaImage.deleteMany({ where: { id: user.avatarImageId } });
    return next;
  });
  await audit(req, { action: 'user.avatar_updated', actorId: user.id, targetType: 'user', targetId: user.id });
  return updated;
}

export async function removeAvatar(user: User, req: Request): Promise<User> {
  if (!user.avatarImageId && !user.avatarUrl) return user;
  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.user.update({ where: { id: user.id }, data: { avatarImageId: null, avatarUrl: null } });
    if (user.avatarImageId) await tx.mediaImage.deleteMany({ where: { id: user.avatarImageId } });
    return next;
  });
  await audit(req, { action: 'user.avatar_removed', actorId: user.id, targetType: 'user', targetId: user.id });
  return updated;
}

const wrongPassword = () => new HttpError(400, 'VALIDATION_ERROR', 'Your current password is incorrect.', { currentPassword: ['Your current password is incorrect.'] });

/** Changes the password and signs out every other session (this one stays signed in). */
export async function changePassword(user: User, currentSessionId: string, input: ChangePasswordInput, req: Request): Promise<void> {
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    await audit(req, { action: 'user.password_change_failed', actorId: user.id, targetType: 'user', targetId: user.id });
    throw wrongPassword();
  }
  const passwordHash = await hashPassword(input.newPassword);
  const [, revoked] = await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId: user.id, id: { not: currentSessionId } } }),
  ]);
  sendMailInBackground(passwordChangedEmail(user.email, user.displayName));
  await audit(req, { action: 'user.password_changed', actorId: user.id, targetType: 'user', targetId: user.id, metadata: { otherSessionsRevoked: revoked.count } });
}

/**
 * Every piece of personal data we hold about the player, as JSON (GDPR art. 15/20).
 * Secrets are excluded: password hash, session and token hashes.
 */
export async function exportData(user: User, req: Request) {
  const id = user.id;
  const [sessions, rounds, scores, stats, favorites, achievements, challenges, xp, notifications, reports, activity] = await Promise.all([
    prisma.session.findMany({ where: { userId: id }, select: { createdAt: true, lastSeenAt: true, expiresAt: true, ipAddress: true, userAgent: true } }),
    prisma.gameSession.findMany({
      where: { userId: id },
      orderBy: { startedAt: 'desc' },
      select: { id: true, status: true, preview: true, startedAt: true, endedAt: true, durationMs: true, game: { select: { slug: true } } },
    }),
    prisma.gameScore.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'desc' },
      select: { sessionId: true, score: true, outcome: true, stats: true, flagged: true, createdAt: true, game: { select: { slug: true } } },
    }),
    prisma.userGameStat.findMany({
      where: { userId: id },
      select: { bestScore: true, bestScoreAt: true, plays: true, totalTimeMs: true, lastPlayedAt: true, game: { select: { slug: true } } },
    }),
    prisma.userFavorite.findMany({ where: { userId: id }, select: { createdAt: true, game: { select: { slug: true } } } }),
    prisma.userAchievement.findMany({ where: { userId: id }, select: { unlockedAt: true, achievement: { select: { key: true, name: true } } } }),
    prisma.userChallengeProgress.findMany({
      where: { userId: id },
      select: { progress: true, completedAt: true, updatedAt: true, challenge: { select: { date: true, title: true, target: true } } },
    }),
    prisma.xpTransaction.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, select: { amount: true, reason: true, sourceType: true, sourceId: true, createdAt: true } }),
    prisma.notification.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' }, select: { type: true, title: true, body: true, link: true, readAt: true, createdAt: true } }),
    prisma.gameReport.findMany({ where: { reporterId: id }, select: { reason: true, details: true, status: true, resolutionNote: true, createdAt: true, game: { select: { slug: true } } } }),
    prisma.auditLog.findMany({
      where: { actorId: id },
      orderBy: { createdAt: 'desc' },
      take: 1000,
      select: { action: true, targetType: true, createdAt: true, ipAddress: true, userAgent: true },
    }),
  ]);
  await audit(req, { action: 'user.data_exported', actorId: id, targetType: 'user', targetId: id });
  const slugOf = <T extends { game: { slug: string } }>({ game, ...rest }: T) => ({ game: game.slug, ...rest });
  return {
    exportedAt: new Date().toISOString(),
    format: 'PLAYVERSE personal data export, version 1',
    account: {
      id: user.id,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      status: user.status,
      xp: user.xp,
      level: user.level,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    sessions,
    rounds: rounds.map(slugOf),
    scores: scores.map(slugOf),
    gameStats: stats.map((s) => ({ ...slugOf(s), totalTimeMs: Number(s.totalTimeMs) })),
    favorites: favorites.map(slugOf),
    achievements: achievements.map((a) => ({ key: a.achievement.key, name: a.achievement.name, unlockedAt: a.unlockedAt })),
    dailyChallenges: challenges.map((c) => ({
      date: c.challenge.date.toISOString().slice(0, 10),
      title: c.challenge.title,
      target: c.challenge.target,
      progress: c.progress,
      completedAt: c.completedAt,
    })),
    xpLedger: xp,
    notifications,
    reportsFiled: reports.map(slugOf),
    securityLog: activity,
  };
}

/**
 * Permanently deletes the account after re-checking the password. Personal data
 * cascades (sessions, rounds, scores, stats, favourites, achievements, XP, notifications);
 * reports and audit entries are kept for moderation and security but lose the link to
 * the person (their user reference is set to null).
 */
export async function deleteAccount(user: User, password: string, req: Request): Promise<void> {
  if (!(await verifyPassword(user.passwordHash, password))) {
    await audit(req, { action: 'user.delete_failed', actorId: user.id, targetType: 'user', targetId: user.id });
    throw new HttpError(400, 'VALIDATION_ERROR', 'Your password is incorrect.', { password: ['Your password is incorrect.'] });
  }
  if (user.role === 'ADMIN' && (await prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE', id: { not: user.id } } })) === 0) {
    throw new HttpError(409, 'CONFLICT', 'You are the only administrator. Make someone else an admin before deleting your account.');
  }
  await audit(req, { action: 'user.deleted', actorId: user.id, targetType: 'user', targetId: user.id, metadata: { role: user.role } });
  await prisma.$transaction(async (tx) => {
    await tx.mediaImage.deleteMany({ where: { uploadedById: user.id, kind: 'avatar' } });
    await tx.user.delete({ where: { id: user.id } });
  });
  sendMailInBackground(accountDeletedEmail(user.email, user.displayName));
}
