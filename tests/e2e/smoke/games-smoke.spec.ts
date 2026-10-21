import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { GAMES_DIR, RESULTS_DIR, RUN_FILE, type SmokeResult, type SmokeRun } from './paths';

/**
 * Launch-flow smoke test for EVERY game module, in a real browser, through the real
 * player page and API: load → start a server session → play (keyboard + pointer on
 * desktop; taps, swipes and on-screen controls on a touch phone) → end the round →
 * result screen. Fails on any game error, uncaught page error or console error.
 *
 * Unpublished games are launched in staff preview mode (nothing is scored). Results
 * are written per project and game to reports/games-smoke; `npm run games:publish`
 * publishes exactly the games that passed in the latest run.
 */
const SLUGS = readdirSync(GAMES_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

test.describe.configure({ mode: 'parallel' });

test.afterEach(async ({}, testInfo) => {
  const slug = testInfo.title.split(':')[0]!;
  const run = JSON.parse(readFileSync(RUN_FILE, 'utf8')) as SmokeRun;
  const result: SmokeResult = {
    runId: run.runId,
    project: testInfo.project.name,
    slug,
    status: testInfo.status ?? 'failed',
    durationMs: testInfo.duration,
    error: testInfo.error?.message?.slice(0, 2000) ?? null,
    finishedAt: new Date().toISOString(),
  };
  const dir = path.join(RESULTS_DIR, testInfo.project.name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${slug}.json`), JSON.stringify(result, null, 2));
});

const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Enter', 'KeyA', 'KeyD', 'Digit1'];
const TAPS: [number, number][] = [
  [0.5, 0.5],
  [0.3, 0.65],
  [0.7, 0.35],
  [0.5, 0.8],
];

for (const slug of SLUGS) {
  test(`${slug}: launches, takes input and ends cleanly`, async ({ page, hasTouch }) => {
    if (hasTouch) {
      const res = await page.request.get(`/api/v1/games/${slug}`);
      const devices = ((await res.json()) as { data: { supportedDevices: string[] } }).data.supportedDevices;
      test.skip(!devices.includes('MOBILE'), 'desktop-only game');
    }

    const problems: string[] = [];
    page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') problems.push(`console error: ${msg.text()}`);
    });

    await page.goto(`/games/${slug}/play`);
    const stage = page.getByTestId('game-stage');
    const play = page.getByRole('region', { name: 'Start' }).getByRole('button', { name: 'Play' });
    await (hasTouch ? play.tap() : play.click());
    await expect(stage).toHaveAttribute('data-phase', 'running');

    const container = page.getByTestId('game-container');
    await expect(container.locator('canvas, .pv-game').first()).toBeVisible();
    await container.scrollIntoViewIfNeeded();
    const running = async () => (await stage.getAttribute('data-phase')) === 'running';

    if (!hasTouch) {
      for (const key of KEYS) {
        await page.keyboard.press(key);
        await page.waitForTimeout(60);
      }
    }
    const box = await container.boundingBox();
    expect(box, 'game container has a size').not.toBeNull();
    // Raw taps only where the game itself is on top: once a round ends, the result screen
    // covers the stage and a stray tap must not press its "Play again".
    const onGame = (x: number, y: number) =>
      page.evaluate(([px, py]) => {
        const hit = document.elementFromPoint(px!, py!);
        return Boolean(hit && document.querySelector('[data-testid="game-container"]')?.contains(hit));
      }, [x, y]);
    for (const [fx, fy] of TAPS) {
      const x = box!.x + box!.width * fx;
      const y = box!.y + box!.height * fy;
      if (!(await running()) || !(await onGame(x, y))) break;
      await (hasTouch ? page.touchscreen.tap(x, y) : page.mouse.click(x, y));
      await page.waitForTimeout(80);
    }
    if (await running()) {
      // A horizontal drag: swipe-controlled games react to it, others ignore it.
      await page.mouse.move(box!.x + box!.width * 0.3, box!.y + box!.height * 0.5);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width * 0.7, box!.y + box!.height * 0.5, { steps: 6 });
      await page.mouse.up();
    }
    const controls = container.locator('[data-action]:not([disabled])');
    for (let i = 0; i < Math.min(3, await controls.count()); i++) {
      if (!(await running())) break;
      const control = controls.nth(i);
      await (hasTouch ? control.tap({ timeout: 2_000 }) : control.click({ timeout: 2_000 })).catch(() => undefined);
    }
    await page.waitForTimeout(400);
    await expect(page.getByTestId('game-error')).toHaveCount(0);

    // End the round unless the game already ended it (a lost move, a timer…). The game may also
    // finish on its own while we reach for the button, so tolerate that, then require the result.
    await expect(stage).toHaveAttribute('data-phase', /^(running|paused|submitting|finished)$/);
    const phase = await stage.getAttribute('data-phase');
    if (phase === 'running' || phase === 'paused') {
      const end = page.getByRole('toolbar', { name: 'Game controls' }).getByRole('button', { name: 'End round' });
      await (hasTouch ? end.tap({ timeout: 5_000 }) : end.click({ timeout: 5_000 })).catch(() => undefined);
    }
    await expect(stage).toHaveAttribute('data-phase', 'finished', { timeout: 15_000 });
    const result = page.getByTestId('round-result');
    await expect(result).toBeVisible();
    await expect(result).not.toContainText('was not saved');

    expect(problems, problems.join('\n')).toEqual([]);
  });
}
