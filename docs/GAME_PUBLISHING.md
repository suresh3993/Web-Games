# Verifying and publishing games

The platform never shows a game as playable unless its launch flow has been tested. All 114 catalog games have a
runtime module, but every game starts as **Coming soon** after seeding. A game becomes **playable** only when it is
`PUBLISHED`, and the only automated path to `PUBLISHED` is the browser smoke test below.

```text
module + unit/contract tests ──► npm run db:seed (COMING_SOON) ──► npm run test:e2e:games ──► npm run games:publish ──► PUBLISHED
```

## 1. Unit and contract tests (no browser)

```powershell
npm test -w @playverse/game-runtime
```

Runs the contract test (every module through a full lifecycle with fuzzed input, cleanup and listener-leak checks),
the rules test (no `Math.random`, storage, network, `eval`, inline handlers…) and the per-game logic tests.

## 2. Browser smoke test (staff preview)

The smoke test launches **every** game through the real player page and API in Chromium, twice:

| Project | Device | Input exercised |
|---|---|---|
| `games-smoke` | Desktop Chrome, 1280×720 | Arrow keys, Space, Enter, letters, mouse clicks, a drag, the game's on-screen controls |
| `games-smoke-mobile` | Pixel 7 emulation (touch) | Taps, a swipe, on-screen controls; skipped for desktop-only games |

For each game it checks that the module loads, a server session starts, the game renders and takes input, the
round can be ended, and the result screen appears, with **no game error, uncaught page error or console error**.
Unpublished games can be launched only by staff, in *preview mode*: preview rounds create a real session but never
scores, stats, XP or play counts.

Prerequisites: the stack running (`npm run infra:up`, `npm run db:deploy`, `npm run db:seed`) and a verified
**moderator or admin** account. To create one, set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (a unique, strong
password) in `.env` and run `npm run db:seed` again.

```powershell
# Credentials of the staff account, for this shell only
$env:E2E_STAFF_EMAIL = "you@example.com"
$env:E2E_STAFF_PASSWORD = "<the password>"
# The run launches 100+ games from one account in a few minutes: raise the volume rate limits
# (login, registration and token limits never scale). Restart `npm run dev` if it is already running.
$env:RATE_LIMIT_MULTIPLIER = "10"

# Recommended: test the production build (minified, served with the production Content-Security-Policy)
$env:E2E_WEB_MODE = "preview"

npx playwright install chromium   # first time only
npm run test:e2e:games
```

Playwright starts the API and the web server if they are not already running and stops them afterwards. With
`E2E_WEB_MODE=preview` it builds the web app and serves it with `vite preview`, which sends the same
Content-Security-Policy as `docker/nginx/nginx.conf` (the setup step fails if the header is missing, for example when
it reused a running `npm run dev`; stop it or pick another port). If the default ports are taken, set `E2E_WEB_PORT` /
`E2E_API_PORT` and add the web origin to `CORS_ORIGINS`.

Results are written to `reports/games-smoke/<project>/<slug>.json` (git-ignored) with a run id; the HTML report with
traces and screenshots of failures is in `playwright-report/`.

## 3. Publish the games that passed

```powershell
npm run games:publish -- --dry-run   # show what would change
npm run games:publish
```

The script reads the **latest** smoke run only. A game is published when it passed on desktop **and**, if it lists
mobile among its supported devices, on the touch phone too. It changes only games that are `COMING_SOON` or
`UNPUBLISHED`, never unpublishes anything, and writes a `game.published` audit-log entry per game (with the run id).
Catalog lists are cached for up to five minutes; restart the API to see the change immediately.

Then regenerate the tracker so the repository records the verification evidence:

```powershell
npm run catalog:docs
```

## Unpublishing

There is no admin UI yet (Milestone 6). To pull a game, set its status to `UNPUBLISHED` (for example with
`npm run db:studio`). The seed never changes a game's status once it exists, so re-seeding keeps your decision.
