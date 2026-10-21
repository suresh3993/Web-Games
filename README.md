# PLAYVERSE

A full-stack browser gaming platform: React + Vite web app, Express + Prisma API, PostgreSQL, Redis, and a
modular game runtime. The catalog roadmap has **114 original games**; see [docs/ROADMAP.md](docs/ROADMAP.md)
for what is built today.

> **Current state (Milestone 1 + Milestone 2 foundation).** Accounts, sessions, email verification, password reset,
> the catalog API and the browsing UI work end-to-end. **No game is playable in the browser yet.** The game player
> page lands in Milestone 3, so every catalog entry is shown as *Coming soon*.

## Repository layout

```text
apps/
  api/            Express 5 REST API (/api/v1), auth, catalog, OpenAPI docs, integration tests
  web/            React 19 + Vite 7 + Tailwind 4 SPA (shadcn-style components, TanStack Query, Zustand)
packages/
  shared-types/   API contracts shared by web and API
  validation/     Zod schemas used by BOTH the web forms and API validation
  game-runtime/   Game integration contract, lifecycle controller, seeded RNG, game modules (Snake)
  game-catalog/   Source of truth for 14 categories and the 114-game roadmap
prisma/           schema.prisma, versioned migrations, idempotent seed
tests/e2e/        Playwright end-to-end tests (real stack + Mailpit)
docker/           Postgres init script, Nginx config
docs/             Architecture, security checklist, roadmap, deployment, game tracker
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
No default administrator is ever created.

> macOS/Linux: identical, except `cp .env.example .env`.
> The test database `playverse_test` is created automatically the first time the Postgres volume initialises.
> If you created the volume before that script existed, run
> `docker compose exec postgres psql -U playverse -c "CREATE DATABASE playverse_test;"`.

## Common commands

| Command | Purpose |
|---|---|
| `npm run dev` | API + web with hot reload |
| `npm test` | All unit + integration tests (API tests need Postgres running) |
| `npm run test:e2e` | Playwright E2E (first run: `npx playwright install chromium`) |
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
- [Roadmap & milestone status](docs/ROADMAP.md)
- [Deployment & rollback](docs/DEPLOYMENT.md)
- [Game implementation & licensing tracker](docs/GAME_TRACKER.md)
