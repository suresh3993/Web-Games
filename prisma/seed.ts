/**
 * Idempotent seed: upserts categories and the full catalog roadmap.
 *
 *  - Safe to re-run: existing rows are updated, never duplicated.
 *  - Never changes a game's status once created, so admin publishing decisions survive re-seeding.
 *  - New games are created as COMING_SOON: nothing is marked playable by the seed.
 *  - No default administrator. An admin is created/promoted only when SEED_ADMIN_EMAIL and
 *    SEED_ADMIN_PASSWORD are both provided (and the password meets the policy).
 */
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { CATEGORIES, GAMES } from '@playverse/game-catalog';
import { loadGameModule } from '@playverse/game-runtime';
import { passwordSchema, emailSchema } from '@playverse/validation';
import { hashPassword } from '../apps/api/src/modules/auth/password';

config({ quiet: true });
const prisma = new PrismaClient();

async function seedCategories() {
  for (const c of CATEGORIES) {
    await prisma.gameCategory.upsert({
      where: { slug: c.slug },
      create: c,
      update: { name: c.name, description: c.description, icon: c.icon, accentColor: c.accentColor, sortOrder: c.sortOrder },
    });
  }
  const rows = await prisma.gameCategory.findMany({ select: { id: true, slug: true } });
  return new Map(rows.map((r) => [r.slug, r.id]));
}

async function seedGames(categoryIds: Map<string, string>) {
  let created = 0;
  for (const g of GAMES) {
    const primaryCategoryId = categoryIds.get(g.category)!;
    const metadata = {
      title: g.title,
      shortDescription: g.summary,
      description: `${g.summary} ${g.details}`,
      instructions: g.howToPlay,
      difficulty: g.difficulty,
      supportedDevices: g.devices,
      estimatedMinutes: g.estimatedMinutes,
      engine: g.engine,
      runtimeKey: g.runtimeKey ?? null,
      // Plausibility ceiling comes straight from the runtime manifest (single source of truth).
      maxScore: g.runtimeKey ? ((await loadGameModule(g.runtimeKey)).manifest.scoring?.maxScore ?? null) : null,
      supportsScores: g.supportsScores,
      supportsProgress: g.supportsProgress ?? false,
      multiplayerMode: g.multiplayerMode ?? null,
      isFeatured: g.featured ?? false,
      licenseType: g.license,
      licenseNotes: 'Original PLAYVERSE implementation; all code and artwork produced in-house.',
      roadmapBatch: g.batch,
      primaryCategoryId,
    };
    const existing = await prisma.game.findUnique({ where: { slug: g.slug }, select: { id: true } });
    const game = existing
      ? await prisma.game.update({ where: { id: existing.id }, data: metadata })
      : await prisma.game.create({ data: { slug: g.slug, status: 'COMING_SOON', ...metadata } });
    if (!existing) created++;

    const categoryLinks = [g.category, ...(g.extraCategories ?? [])].map((slug) => ({
      gameId: game.id,
      categoryId: categoryIds.get(slug)!,
    }));
    await prisma.$transaction([
      prisma.gameCategoryLink.deleteMany({ where: { gameId: game.id } }),
      prisma.gameCategoryLink.createMany({ data: categoryLinks }),
    ]);
  }
  // Entries removed from the catalog (e.g. renamed concepts) are hidden, never deleted:
  // they may have history, and admins can still inspect them.
  const retired = await prisma.game.updateMany({
    where: { slug: { notIn: GAMES.map((g) => g.slug) }, status: { in: ['COMING_SOON', 'PUBLISHED'] } },
    data: { status: 'DRAFT' },
  });
  if (retired.count) console.log(`• Hid ${retired.count} game(s) no longer in the catalog (status → DRAFT).`);
  return created;
}

async function seedAdmin() {
  const rawEmail = process.env.SEED_ADMIN_EMAIL?.trim();
  const rawPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!rawEmail || !rawPassword) {
    console.log('• No SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD set — skipping admin account (none is created by default).');
    return;
  }
  const email = emailSchema.parse(rawEmail);
  const password = passwordSchema.safeParse(rawPassword);
  if (!password.success) throw new Error('SEED_ADMIN_PASSWORD does not meet the password policy (min 10 characters).');

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } });
    console.log(`• Promoted existing account ${email} to ADMIN (password unchanged).`);
  } else {
    await prisma.user.create({
      data: {
        email,
        displayName: 'Administrator',
        passwordHash: await hashPassword(password.data),
        role: 'ADMIN',
        emailVerifiedAt: new Date(),
      },
    });
    console.log(`• Created ADMIN account ${email}.`);
  }
  await prisma.auditLog.create({ data: { action: 'seed.admin_provisioned', targetType: 'user', metadata: { email } } });
}

async function main() {
  const categoryIds = await seedCategories();
  console.log(`• Upserted ${categoryIds.size} categories.`);
  const created = await seedGames(categoryIds);
  console.log(`• Upserted ${GAMES.length} catalog games (${created} new, created as COMING_SOON).`);
  await seedAdmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
