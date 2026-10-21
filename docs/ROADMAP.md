# Roadmap & milestone status

Last updated: 2026-10-21

| Milestone | Scope | Status |
|---|---|---|
| 1 — Architecture | Monorepo, schema, game contract, API contracts, licensing approach | ✅ Done |
| 2 — Core platform | Design system, auth (register / login / verify / reset), Postgres + Prisma, migrations, seed | 🟡 Foundation done (see below) |
| 3 — Game runtime | Player page, first 10 playable games, sessions, scores, favorites, history | ⏳ Next. Contract and Snake module are done |
| 4 — Progression | XP, levels, achievements, daily challenges, leaderboards, anti-abuse | ⏳ Schema ready |
| 5 — Catalog expansion | Batches 2–10 until 100+ games are genuinely playable | ⏳ 114 entries planned |
| 6 — Administration | Admin and moderator dashboards, game, user and report management, audit views | ⏳ RBAC guards done |
| 7 — Quality | Full E2E coverage, accessibility and performance audits, security review | ⏳ |
| 8 — Deployment | Production Docker, HTTPS, backups, monitoring | 🟡 Dockerfile, compose, Nginx and CI drafted |

## Milestone 2: done vs remaining

Done: registration, login, logout (one session or all), email verification and resend, password reset, sessions,
CSRF, rate limiting, audit log, catalog API (search, filters, pagination, featured, trending, categories, details,
related), Home, Explore, Categories, Game Details, Login, Register, Forgot Password, Reset Password, Verify Email,
404 and error pages, dark/light theme, responsive navigation.

Remaining pages from the spec (scheduled with the features they depend on): Profile and Edit Profile, Favorites,
Recently Played (M3); Achievements, Leaderboards, Daily Challenges, Notifications (M4); Settings, Privacy Policy,
Terms of Service, Help and Support, account deletion and data export (M3/M5); Admin pages (M6).

## Game delivery batches

Ten batches of 10–13 games each. The full per-game list, with engine, devices, licence and status, is in
[GAME_TRACKER.md](GAME_TRACKER.md). A game is published only after:
1. its runtime module passes unit tests for rules and lifecycle,
2. its launch → play → finish → score flow passes an E2E test on desktop and mobile,
3. an admin publishes it (status `PUBLISHED`).
