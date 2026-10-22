# Roadmap & milestone status

Last updated: 2026-10-22

| Milestone | Scope | Status |
|---|---|---|
| 1 — Architecture | Monorepo, schema, game contract, API contracts, licensing approach | ✅ Done |
| 2 — Core platform | Design system, auth, profiles, settings, account deletion and data export, legal and help pages | ✅ Done |
| 3 — Game runtime | Player page, playable games, sessions, scores, favorites, history | ✅ Done |
| 4 — Progression | XP, levels, achievements, daily challenges, notifications, leaderboards, anti-abuse | ✅ Done |
| 5 — Catalog expansion | 100+ genuinely playable games | ✅ 114 games implemented and smoke-tested in the browser; published per deployment |
| 6 — Administration | Admin and moderator dashboards: users, games, categories, reports and analytics, achievements, challenges, audit log | ✅ Done |
| 7 — Quality | Full E2E coverage, accessibility and performance audits, security review | 🟡 E2E for every spec flow and every game (desktop + touch, production build with CSP); automated WCAG 2.2 AA audit of every page, both themes, clean ([ACCESSIBILITY.md](ACCESSIBILITY.md)); lab Core Web Vitals "good" on all measured pages ([PERFORMANCE.md](PERFORMANCE.md)). Manual screen-reader pass, field data and an external security review remain |
| 8 — Deployment | Production Docker, HTTPS, backups, monitoring | 🟡 Dockerfile, compose, Nginx and CI written; images built locally (see DEPLOYMENT.md); HTTPS, monitoring and backup automation are operator tasks |

## Pages (spec §4)

All 27 are implemented: Home, Explore, Categories, Game Details, Game Player, Login, Register, Forgot Password, Email
Verification, User Profile, Edit Profile, Favourites, Recently Played, Achievements, Leaderboards, Daily Challenges,
Notifications, Settings, Privacy Policy, Terms of Service, Help and Support, Admin Dashboard, Admin User Management, Admin
Game Management, Admin Category Management, Admin Reports and Analytics, and 404/error pages. The admin area also has
Achievement configuration, Challenge management and the Audit log.

## Essential flows (spec §14)

| # | Flow | Covered by |
|---|---|---|
| 1–3 | Register, verify email, log in and out | `tests/e2e/auth.spec.ts` |
| 4 | Browse and search games | `tests/e2e/catalog.spec.ts` |
| 5–7 | Launch and finish a game, submit and retrieve a score, favourites | `tests/e2e/gameplay.spec.ts` |
| 8 | Unlock an achievement | `tests/e2e/progression.spec.ts` |
| 9 | View leaderboards | `tests/e2e/gameplay.spec.ts` |
| 10 | Attempt unauthorized admin access | `tests/e2e/admin.spec.ts` (UI and API) |
| 11 | Reset a password | `tests/e2e/auth.spec.ts` |
| 12 | Play using mobile controls | `tests/e2e/smoke` (`games-smoke-mobile`, every phone-capable game) |

## Remaining

- **Audits:** the automated accessibility audit and lab Core Web Vitals are done and recorded. Still to do:
  - a manual screen-reader and keyboard-only pass (see [ACCESSIBILITY.md](ACCESSIBILITY.md));
  - field Core Web Vitals from a deployed instance;
  - an independent security review.
- **Scores:** server-side replay verification for high-value leaderboards (the per-round server seed makes it possible).
- **Games:** AI difficulty balancing and long-session play are not covered by automated tests; mobile is verified with
  Chromium device emulation, not physical devices.
- **Operations:** HTTPS termination, off-host encrypted backups, log shipping and alerting for a real deployment.

## Game delivery and publishing

All games ship through the same gate ([GAME_PUBLISHING.md](GAME_PUBLISHING.md)):

1. the runtime module passes the contract test (lifecycle, fuzzed and sustained input, injection probe, cleanup) and the
   rules test;
2. the browser smoke test launches it through the real player page and API on desktop, and on a touch phone when the game
   supports phones, with no errors;
3. `npm run games:publish` (or an admin, after a finished preview round) marks it `PUBLISHED`, audit-logged. Seeding never
   publishes anything.
