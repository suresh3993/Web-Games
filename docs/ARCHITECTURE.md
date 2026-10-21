# Architecture

## Overview

```
Browser ──► Nginx (prod) / Vite dev server ──► /api/v1 ──► Express API ──► PostgreSQL (Prisma)
   │            static SPA                                      ├──► Redis (rate limits, cache)
   │                                                            └──► SMTP (Mailpit in dev)
   └── game modules (lazy chunks from @playverse/game-runtime) run entirely in the browser
```

- **Same origin.** In development Vite proxies `/api`; in production Nginx serves the SPA and proxies `/api`.
  Cookies are therefore first-party, and CORS is only a safety net (allowlist via `CORS_ORIGINS`).
- **Monorepo** (npm workspaces). Workspace packages ship TypeScript source. Vite and tsx consume it directly,
  and tsup bundles it into the API build.

## Key decisions

| Decision | Choice | Why |
|---|---|---|
| Auth model | Server-side sessions in Postgres; random 256-bit token in an HttpOnly cookie; only the SHA-256 hash is stored | Instant revocation (logout, password reset, suspension), no tokens in JS-readable storage |
| CSRF | SameSite=Lax + Origin allowlist + double-submit token (`GET /auth/csrf` → `X-CSRF-Token`) | Defence in depth for cookie auth |
| Passwords | Argon2id (m=19 MiB, t=2, p=1), length policy 10–128 | OWASP recommendation; the PHC string allows raising parameters later |
| Validation | Zod schemas in `packages/validation`, shared by forms and API | One source of rules; the OpenAPI request bodies are generated from them |
| Rate limiting | express-rate-limit with a Redis store that falls back to memory | Works across replicas; a Redis outage degrades instead of failing every request |
| Catalog truth | `packages/game-catalog` (code) → idempotent seed → DB | Reviewable diffs; the seed never overrides admin publishing decisions |
| Game status | `DRAFT` / `COMING_SOON` / `PUBLISHED` / `UNPUBLISHED`; `playable` = published **and** has a runtime | Never shows unlaunchable games as playable |
| Versions | TypeScript 5.9, Vite 7, Prisma 6, Vitest 4 (pinned majors) | Stable, compatible set; newer majors (TS 7, Vite 8, Prisma 7) to be evaluated separately |

## Data model (Prisma)

Identity: `User`, `Session`, `AuthToken` (email verification / password reset; hash-only, single-use, expiring).
Catalog: `GameCategory`, `Game`, `GameCategoryLink` (many-to-many; plus `Game.primaryCategoryId`).
Gameplay: `GameSession` (server-issued seed), `GameScore` (unique `sessionId` makes submissions idempotent),
`UserGameStat` (personal best, plays, recently played), `UserFavorite`.
Progression: `Achievement`, `UserAchievement`, `DailyChallenge`, `UserChallengeProgress`, `XpTransaction`
(unique `(userId, sourceType, sourceId)` prevents duplicate rewards).
Moderation and audit: `Notification`, `GameReport`, `AuditLog`.

History-bearing relations to `Game` use `onDelete: Restrict`: games are unpublished, never hard-deleted.
User deletion cascades personal data. Reports and audit entries keep the record but null the user.

## Game integration contract (`packages/game-runtime`)

```ts
interface GameModule { manifest: GameManifest; create(host: GameHost): GameInstance }

interface GameHost {            // provided by the platform
  container: HTMLElement; viewport; settings: { soundEnabled; reducedMotion };
  seed: string; random(): number;          // seeded PRNG: rounds are reproducible
  emit(e: { type: 'score' | 'finished' | 'error', ... }): void;
}

interface GameInstance {        // implemented by each game
  start(); pause(); resume(); restart(); finish(); resize(viewport); setSettings?(s); destroy();
}
```

`GameController` owns the instance and enforces the lifecycle:
`idle → running ⇄ paused → finished → (restart) running`, and `destroy()` from any state.
It measures active play time itself (pauses excluded; games cannot report their own duration), sanitises scores,
ignores events after the round ends, auto-pauses when the tab is hidden, and converts module exceptions into
`error` events. The registry maps `runtimeKey → () => import(...)`, so each game is its own lazy chunk.

Rules for module authors: render only inside `container`; never touch cookies, storage, `fetch` or navigation;
use `host.random()`; emit `finished` exactly once; release every listener, timer and frame in `destroy()`.
Snake (`games/snake`) is the reference implementation: pure rules in `logic.ts`, rendering and input in `index.ts`.

## Scoring, XP and anti-abuse (implemented in Milestone 4)

These rules are already reflected in the schema:

- A score is accepted only for a server-created `GameSession` owned by the user, once (`GameScore.sessionId` is unique).
- Plausibility checks: `score ≤ manifest.scoring.maxScore`, duration bounded by server wall-clock time
  (`startedAt` → finish), and minimum duration per game. Scores that fail are stored `flagged = true` and kept off
  leaderboards. Client-side games are never fully trustworthy. The server-issued seed allows deterministic
  re-simulation (input-log replay) for high-value leaderboards later.
- XP per finished session: `10 + min(20, floor(activeMinutes × 4))`, at most 30 per session, and capped
  per game per day (planned: 300). Awarded through `XpTransaction`, so a replayed request cannot award twice.
- Level `n` requires `100 × n × (n − 1) / 2` total XP (100 for L2, 300 for L3, 600 for L4 …).
- Score, stats, XP and achievements are updated in a single database transaction.
