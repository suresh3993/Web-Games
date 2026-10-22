import { devices, expect, test, type Browser } from '@playwright/test';
import { publishedGame } from './helpers';

/**
 * Lab measurement of Core Web Vitals on a phone profile with Lighthouse's mobile throttling
 * (slow 4G: 1.6 Mbps down, 150 ms RTT; 4x CPU slowdown), cold cache per page. Run it against the
 * production build (E2E_WEB_MODE=preview); against the dev server the numbers are meaningless.
 * Lab numbers on localhost are not field data: re-measure on the deployed site.
 *
 * Opt-in (E2E_PERF=1, one worker): timings are only meaningful on an otherwise idle machine.
 * The budget is a regression guard with headroom over today's numbers (docs/PERFORMANCE.md);
 * Google's "good" line is LCP <= 2.5 s and CLS <= 0.1.
 */
const BUDGET = { lcpMs: 3000, cls: 0.1 };

interface Vitals {
  fcpMs: number;
  lcpMs: number;
  cls: number;
  jsKb: number;
  totalKb: number;
}

async function measure(browser: Browser, baseURL: string, path: string): Promise<Vitals> {
  const { defaultBrowserType: _ignored, ...phone } = devices['Pixel 7'];
  const context = await browser.newContext({ ...phone, baseURL, reducedMotion: 'no-preference' });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.addInitScript(() => {
    const vitals = { lcp: 0, cls: 0 };
    (window as unknown as { __vitals: typeof vitals }).__vitals = vitals;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) vitals.lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) vitals.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto(path, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForTimeout(1500);
  const vitals = await page.evaluate(() => {
    const v = (window as unknown as { __vitals: { lcp: number; cls: number } }).__vitals;
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const kb = (list: PerformanceResourceTiming[]) => Math.round(list.reduce((sum, r) => sum + r.transferSize, 0) / 1024);
    return {
      fcpMs: Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? 0),
      lcpMs: Math.round(v.lcp),
      cls: Math.round(v.cls * 1000) / 1000,
      jsKb: kb(resources.filter((r) => r.name.endsWith('.js'))),
      totalKb: kb(resources) + Math.round(nav.transferSize / 1024),
    };
  });
  await context.close();
  return vitals;
}

test('core pages stay within the Core Web Vitals budget on a throttled phone', async ({ browser, baseURL, page }) => {
  test.skip(!process.env.E2E_PERF, 'set E2E_PERF=1 and run with --workers=1 on an idle machine');
  test.setTimeout(240_000);
  const game = await publishedGame(page);
  const paths = ['/', '/explore', '/categories', '/leaderboards', ...(game ? [`/games/${game.slug}`, `/games/${game.slug}/play`] : [])];
  const rows: string[] = [];
  const failures: string[] = [];
  for (const path of paths) {
    const v = await measure(browser, baseURL!, path);
    rows.push(`${path.padEnd(28)} FCP ${String(v.fcpMs).padStart(5)} ms  LCP ${String(v.lcpMs).padStart(5)} ms  CLS ${v.cls.toFixed(3)}  JS ${v.jsKb} KB  total ${v.totalKb} KB`);
    if (v.lcpMs > BUDGET.lcpMs) failures.push(`${path}: LCP ${v.lcpMs} ms > ${BUDGET.lcpMs} ms`);
    if (v.cls > BUDGET.cls) failures.push(`${path}: CLS ${v.cls} > ${BUDGET.cls}`);
  }
  console.log(`\nCore Web Vitals (lab, throttled phone, cold cache)\n${rows.join('\n')}`);
  await test.info().attach('web-vitals.txt', { body: rows.join('\n'), contentType: 'text/plain' });
  expect(failures, failures.join('\n')).toEqual([]);
});
