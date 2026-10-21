import path from 'node:path';

/** Files shared by the all-games smoke test and scripts/publish-verified-games.ts. */
export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const STAFF_STATE = path.join(ROOT, 'playwright/.auth/staff.json');
export const RESULTS_DIR = path.join(ROOT, 'reports/games-smoke');
export const RUN_FILE = path.join(RESULTS_DIR, '_run.json');
export const GAMES_DIR = path.join(ROOT, 'packages/game-runtime/src/games');

export interface SmokeRun {
  runId: string;
  startedAt: string;
  baseURL: string;
  /** "production build" (minified, production CSP) or "dev server". */
  webMode: string;
}

/** Desktop is required for every game; mobile for games that list MOBILE support. */
export const SMOKE_PROJECTS = { desktop: 'games-smoke', mobile: 'games-smoke-mobile' } as const;

export interface SmokeResult {
  runId: string;
  project: string;
  slug: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
  durationMs: number;
  error: string | null;
  finishedAt: string;
}
