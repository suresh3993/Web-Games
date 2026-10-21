# Roadmap & milestone status

Last updated: 2026-10-21

| Milestone | Scope | Status |
|---|---|---|
| 1 — Architecture | Monorepo, schema, game contract, API contracts, licensing approach | ✅ Done |
| 2 — Core platform | Design system, auth (register / login / verify / reset), Postgres + Prisma, migrations, seed | 🟡 Foundation done (see below) |
| 3 — Game runtime | Player page, playable games, sessions, scores, favorites, history | ✅ Done |
| 4 — Progression | XP, levels, achievements, daily challenges, leaderboards, anti-abuse | 🟡 XP, levels, per-game and global leaderboards and anti-abuse done; achievements, daily challenges and notifications remain |
| 5 — Catalog expansion | 100+ genuinely playable games | ✅ 114 games implemented and smoke-tested in the browser; published per deployment by `npm run games:publish` |
| 6 — Administration | Admin and moderator dashboards, game, user and report management, audit views | ⏳ RBAC guards, staff preview of unpublished games and player reports (API) done |
| 7 — Quality | Full E2E coverage, accessibility and performance audits, security review | 🟡 Launch-flow E2E for every game (desktop + touch), player-flow E2E; audits remain |
| 8 — Deployment | Production Docker, HTTPS, backups, monitoring | 🟡 Dockerfile, compose, Nginx and CI drafted |

## Done

**Platform:** registration, login, logout (one session or all), email verification and resend, password reset, sessions,
CSRF, rate limiting, audit log, catalog API (search, filters, pagination, featured, trending, categories, details,
related), dark/light theme, responsive navigation.

**Gameplay (M3/M4):** game sessions with server seeds, heartbeat and abandonment; score submission exactly once with
plausibility flags; personal bests; XP (per-round, minimum length, daily cap per game) and levels; per-game
leaderboards (all time, week, day) and a global XP leaderboard; favourites; play history; player reports; staff
preview of unpublished games. See [API.md](API.md#gameplay-rules).

**Pages:** Home, Explore, Categories, Game Details (with Play, favourite and leaderboard), **Game Player**,
**Favourites**, **Recently Played**, **Leaderboards**, Login, Register, Forgot Password, Reset Password, Verify Email,
404 and error pages.

**Games (M5):** all 114 catalog entries have an original runtime module. Every module passes the contract and rules
tests, 41 have dedicated logic tests, and all 114 passed the browser launch-flow smoke test on desktop, as did all
100 phone-capable games on an emulated touch phone ([GAME_TRACKER.md](GAME_TRACKER.md)).

## Remaining

- **M2 pages:** Profile and Edit Profile (avatar, display name), Settings, Privacy Policy, Terms of Service, Help and
  Support, account deletion and personal-data export.
- **M4:** achievements (schema ready), daily challenges (schema ready), notifications UI.
- **M6:** admin and moderator UI: game management (publish/unpublish without the script), users, reports, audit views.
- **M7:** accessibility and performance audits with measured results; server-side replay verification for
  high-value leaderboards.
- **Games:** AI opponents and puzzle generators are tested for rules and solvability, but difficulty balancing and
  long-session play are not yet covered by automated tests; mobile verification uses Chromium device emulation, not
  physical devices.

## Game delivery and publishing

All games ship through the same gate ([GAME_PUBLISHING.md](GAME_PUBLISHING.md)):

1. the runtime module passes the contract test (lifecycle, fuzzed input, cleanup) and the rules test;
2. the browser smoke test launches it through the real player page and API on desktop, and on a touch phone when the
   game supports phones, with no errors;
3. `npm run games:publish` marks it `PUBLISHED` (audit-logged). Seeding never publishes anything.
