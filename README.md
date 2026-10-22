# PLAYVERSE

A full-stack browser gaming platform: React + Vite web app, Express + Prisma API, PostgreSQL, Redis, and a
modular game runtime with **114 original games**. See [docs/ROADMAP.md](docs/ROADMAP.md) for what is built today.

> **Current state.** All 114 games are implemented (original TypeScript, no third-party game code or assets), unit-
> and contract-tested, and launched end-to-end in a real browser by an automated smoke test. Every page in the spec
> exists: accounts and profiles (avatars, settings, data export, account deletion), the game player, scores, XP and
> levels, achievements, daily challenges, notifications, leaderboards, favourites, history, help and legal pages, and
> a role-based admin area (dashboard, users, games, categories, reports and analytics, achievements, challenges, audit log).
> **A game becomes playable on your instance only after it is published**: seeding creates every game as
> *Coming soon*, and `npm run games:publish` publishes exactly the games that passed the smoke test
> ([how](docs/GAME_PUBLISHING.md)).

## Repository layout

```text
apps/
  api/            Express 5 REST API (/api/v1), auth, catalog, OpenAPI docs, integration tests
  web/            React 19 + Vite 7 + Tailwind 4 SPA (shadcn-style components, TanStack Query, Zustand)
packages/
  shared-types/   API contracts shared by web and API
  validation/     Zod schemas used by BOTH the web forms and API validation
  game-runtime/   Game contract, lifecycle controller, seeded RNG, game kit and all 114 game modules
  game-catalog/   Source of truth for the 14 categories and 114 catalog entries
prisma/           schema.prisma, versioned migrations, idempotent seed
tests/e2e/        Playwright end-to-end tests (real stack + Mailpit); tests/e2e/smoke launches every game
scripts/          Catalog docs generator, smoke-verified game publisher
docker/           Postgres init script, Nginx config
docs/             Architecture, API, security, accessibility, performance, roadmap, deployment, game tracker, publishing
```

## Prerequisites

- **Node.js 22.12+** and npm 10
- **Docker Desktop** (runs PostgreSQL 16, Redis 7 and Mailpit)

Host ports used: `5433` (Postgres), `6380` (Redis), `1025`/`8025` (Mailpit), `4000` (API), `5173` (web).
They avoid the default 5432/6379 so they don't clash with other local databases.

## Run locally on Windows (PowerShell)

```powershell
# 1. Install dependencies (also generates the Prisma client)
npm install

# 2. Create your local environment file. It works as-is for local development; if you change
#    POSTGRES_PASSWORD, change it in DATABASE_URL and TEST_DATABASE_URL too.
copy .env.example .env

# 3. Start PostgreSQL, Redis and Mailpit (Docker Desktop must be running)
npm run infra:up

# 4. Apply migrations and seed categories + the game catalog (safe to re-run)
npm run db:deploy
npm run db:seed

# 5. Start the API (http://localhost:4000) and web app (http://localhost:5173)
npm run dev
```

Then open **<http://localhost:5173>**. Emails (verification, password reset) are delivered to Mailpit at
**<http://localhost:8025>**. API documentation (Swagger UI) is at **<http://localhost:4000/api/docs>**.

Optional admin account: set `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env`, then re-run `npm run db:seed`.
No default administrator is ever created. Admins open the admin area from the account menu (**Admin dashboard**) or at
`/admin`; they can promote other accounts to moderator or admin there. The help page shows a contact address when
`VITE_SUPPORT_EMAIL` is set at build time.

### Make the games playable

Every game is seeded as *Coming soon*. An admin or moderator can already open any game at
`/games/<slug>/play` in **preview mode** (nothing is scored). To publish the games for everyone, run the browser
smoke test and publish what passed (about 10 minutes; details in [docs/GAME_PUBLISHING.md](docs/GAME_PUBLISHING.md)):

```powershell
$env:E2E_STAFF_EMAIL = "<your SEED_ADMIN_EMAIL>"
$env:E2E_STAFF_PASSWORD = "<your SEED_ADMIN_PASSWORD>"
$env:RATE_LIMIT_MULTIPLIER = "10"   # the smoke test launches 100+ games quickly
$env:E2E_WEB_MODE = "preview"       # test the production build with the production CSP
# Stop `npm run dev` first: Playwright starts (and afterwards stops) the servers with these settings.
npx playwright install chromium     # first time only
npm run test:e2e:games              # every game, desktop + touch phone
npm run games:publish               # publishes only the games that passed
```

Players need an account with a verified email to launch games. Scores, XP, levels, leaderboards, favourites and
history are recorded from then on.

> macOS/Linux: identical, except `cp .env.example .env`.
> The test database `playverse_test` is created automatically the first time the Postgres volume initialises.
> If you created the volume before that script existed, run
> `docker compose exec postgres psql -U playverse -c "CREATE DATABASE playverse_test;"`.

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | API + web with hot reload |
| `npm test` | All unit + integration tests (API tests need Postgres running) |
| `npm run test:e2e` | Playwright user flows and the accessibility audit, desktop + mobile (first run: `npx playwright install chromium`) |
| `npx playwright test tests/e2e/perf.spec.ts --project=desktop-chromium --workers=1` | Core Web Vitals budget on a throttled phone (set `E2E_PERF=1` and `E2E_WEB_MODE=preview`; idle machine) |
| `npm run test:e2e:games` | Launch-flow smoke test of every game (needs a staff account, see above) |
| `npm run games:publish` | Publish the games that passed the latest smoke test (`-- --dry-run` to preview) |
| `npm run typecheck` | TypeScript across all workspaces and E2E specs |
| `npm run build` | Production builds (API bundle + static web app) |
| `npm run db:migrate` | Create a new migration after editing `prisma/schema.prisma` |
| `npm run db:studio` | Browse the database |
| `npm run catalog:docs` | Regenerate `docs/GAME_TRACKER.md` from the catalog |
| `npm run infra:down` | Stop the Docker services (data is kept in volumes) |

## Documentation

- [Architecture & game integration contract](docs/ARCHITECTURE.md)
- [API reference](docs/API.md) (live OpenAPI: `/api/docs`)
- [Security checklist](docs/SECURITY.md)
- [Accessibility audit](docs/ACCESSIBILITY.md)
- [Performance measurements](docs/PERFORMANCE.md)
- [Roadmap & milestone status](docs/ROADMAP.md)
- [Deployment & rollback](docs/DEPLOYMENT.md)
- [Game implementation & licensing tracker](docs/GAME_TRACKER.md)
- [Verifying and publishing games](docs/GAME_PUBLISHING.md)
