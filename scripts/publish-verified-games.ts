/**
 * Publishes the games whose launch flow passed the browser smoke test.
 *
 *   npm run test:e2e:games          writes reports/games-smoke/<project>/<slug>.json for every game
 *   npm run games:publish           marks the games that passed in that run PUBLISHED
 *   npm run games:publish -- --dry-run
 *
 * A game qualifies when, in the latest smoke run, it passed on desktop AND (if it lists
 * MOBILE among its supported devices) on the touch-phone profile too. Only games with a
 * runtime module that are COMING_SOON or UNPUBLISHED are changed; failures are left
 * untouched (never unpublished automatically). Every change is audit-logged.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { RESULTS_DIR, RUN_FILE, SMOKE_PROJECTS, type SmokeResult, type SmokeRun } from '../tests/e2e/smoke/paths';

config({ quiet: true });
const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

function readRun(): { run: SmokeRun; results: Record<string, Map<string, SmokeResult>> } {
  if (!existsSync(RUN_FILE)) throw new Error(`No smoke-test run found in ${RESULTS_DIR}. Run "npm run test:e2e:games" first.`);
  const run = JSON.parse(readFileSync(RUN_FILE, 'utf8')) as SmokeRun;
  const results: Record<string, Map<string, SmokeResult>> = {};
  for (const project of Object.values(SMOKE_PROJECTS)) {
    const dir = path.join(RESULTS_DIR, project);
    const byGame = new Map<string, SmokeResult>();
    if (existsSync(dir)) {
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
        const result = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as SmokeResult;
        if (result.runId === run.runId) byGame.set(result.slug, result);
      }
    }
    results[project] = byGame;
  }
  return { run, results };
}

async function main() {
  const { run, results } = readRun();
  const desktop = results[SMOKE_PROJECTS.desktop]!;
  const mobile = results[SMOKE_PROJECTS.mobile]!;
  console.log(
    `Smoke run ${run.runId} (${run.startedAt}, ${run.baseURL}, ${run.webMode ?? 'dev server'}): ` +
      `${desktop.size} desktop and ${mobile.size} mobile results.`,
  );

  const games = await prisma.game.findMany({
    where: { runtimeKey: { not: null } },
    select: { id: true, slug: true, status: true, supportedDevices: true },
    orderBy: { slug: 'asc' },
  });

  const qualified: typeof games = [];
  for (const game of games) {
    const problems: string[] = [];
    const d = desktop.get(game.slug);
    if (d?.status !== 'passed') problems.push(`desktop ${d?.status ?? 'not run'}${d?.error ? `: ${d.error.split('\n')[0]}` : ''}`);
    if (game.supportedDevices.includes('MOBILE')) {
      const m = mobile.get(game.slug);
      if (m?.status !== 'passed') problems.push(`mobile ${m?.status ?? 'not run'}${m?.error ? `: ${m.error.split('\n')[0]}` : ''}`);
    }
    if (problems.length) console.log(`  ✗ ${game.slug}: ${problems.join('; ')}`);
    else qualified.push(game);
  }

  const candidates = qualified.filter((g) => g.status === 'COMING_SOON' || g.status === 'UNPUBLISHED');
  const alreadyLive = qualified.filter((g) => g.status === 'PUBLISHED').length;
  console.log(
    `${qualified.length}/${games.length} games qualify; ${candidates.length} to publish${dryRun ? ' (dry run)' : ''}, ${alreadyLive} already published.`,
  );
  if (dryRun || candidates.length === 0) return;

  const now = new Date();
  await prisma.$transaction([
    prisma.game.updateMany({ where: { id: { in: candidates.map((c) => c.id) } }, data: { status: 'PUBLISHED', publishedAt: now } }),
    prisma.auditLog.createMany({
      data: candidates.map((c) => ({
        action: 'game.published',
        targetType: 'game',
        targetId: c.id,
        metadata: { slug: c.slug, via: 'smoke-test', runId: run.runId },
      })),
    }),
  ]);
  console.log(`Published ${candidates.length} game(s).`);
  console.log('Catalog lists are cached for up to 5 minutes; restart the API to see the change immediately.');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
