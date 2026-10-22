# Architecture

## Overview

```text
Browser ──► Nginx (prod) / Vite dev server ──► /api/v1 ──► Express API ──► PostgreSQL (Prisma)
   │            static SPA                                      ├──► Redis (rate limits, cache)
   │                                                            └──► SMTP (Mailpit in dev)
   └── game modules (lazy chunks from @suresh/game-runtime) run entirely in the browser
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
| Game engines | Original TypeScript modules on two small in-house bases (`CANVAS`, `DOM`); no Phaser | 114 games share one input, timing, sound and lifecycle layer; no third-party game code or assets to license; each game is a 1–11 kB lazy chunk plus shared kit chunks (7–22 kB, cached across games) |
| Publishing | Only games that pass the browser smoke test are published, by script, with an audit entry | "Never represent a game as playable unless its launch flow has been tested" |
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

### Game modules and the game kit

All 114 catalog games are implemented as modules in `packages/game-runtime/src/games/<slug>/` (folder name =
runtime key = catalog slug). `scripts/generate-registry.mjs` regenerates the registry from the folders, so a game
cannot be registered without its module, and the catalog test fails if catalog and registry disagree.

Two engines, both plain TypeScript with no third-party game code or assets (all artwork is drawn in code; sound is
synthesised with Web Audio):

| Engine | Base class | Used for | Count |
|---|---|---|---|
| `CANVAS` | `kit/canvas-game.ts` | Real-time games: fixed-step loop, letterboxed 2D canvas, unified keyboard/pointer/touch input, immediate-mode buttons | 37 |
| `DOM` | `kit/dom-game.ts` | Board, card, puzzle, word and math games: HTML/CSS views, delegated `data-action` clicks, keyboard and swipe hooks, pause-aware timers | 77 |

Shared kit modules: seeded card decks (`cards.ts`), negamax/alpha-beta AI with difficulty blunders (`ai.ts`),
word lists (`words.ts`), physics (`physics.ts`), maze generation (`maze.ts`), poker hand ranking (`poker.ts`),
a platformer engine with a reachability checker and a solvable-by-construction level generator, and a timed
quiz base. Generated puzzles (crate pusher, mahjong, light toggle, kakuro, calc cages, star battle, bridges, color
link…) are built backwards from a solution so they are always solvable, and the rules tests prove it.

Every module is verified at three levels (see [GAME_TRACKER.md](GAME_TRACKER.md)):

1. **Contract test** (`src/contract.test.ts`, jsdom): full lifecycle with fuzzed keyboard, pointer and button input,
   pause/resume, restart, resize, finish and destroy; asserts no errors, one `finished` per round, scores within the
   manifest ceiling, valid stats, an empty container and no leaked window listeners afterwards.
2. **Rules test** (`src/determinism.test.ts`): no `Math.random`, storage, cookies, network, navigation, `eval` or
   inline event handlers (which the CSP would block) anywhere in game code. Many games also have dedicated logic tests.
3. **Browser smoke test** (`tests/e2e/smoke`): launches every game through the real player page and API.

### Player page

`/games/:slug/play` (`apps/web/src/features/play`) lazy-loads only the launched game's chunk, asks the API for a
session (server seed), and drives a `GameController`: play, pause/resume, restart, end round, sound toggle,
full screen (where supported), live score and personal best, controls from the manifest, top players, favourite
toggle and problem reports. It resizes the game with a `ResizeObserver`, auto-pauses when the tab is hidden, warns on
portrait screens for landscape games, sends a heartbeat every minute, and asks before in-app navigation ends a round
(`useBlocker`) or the tab closes (`beforeunload`). A round ended by leaving, restarting or closing the tab is still
submitted as `quit` (the request uses `fetch` keepalive so it survives the page going away).

### Publishing pipeline

```text
module + unit/contract tests ──► seed (COMING_SOON) ──► staff preview smoke test ──► npm run games:publish ──► PUBLISHED
```

The seed never publishes. Only `scripts/publish-verified-games.ts` changes `COMING_SOON` to `PUBLISHED`, and only for
games that passed the latest browser smoke run (desktop, plus mobile when the game supports phones). Each change
is audit-logged. Details: [GAME_PUBLISHING.md](GAME_PUBLISHING.md).

## Scoring, XP and anti-abuse

Implemented in `apps/api/src/modules/gameplay` (rules also listed in [API.md](API.md#gameplay-rules)):

- A score is accepted only for a server-created `GameSession` owned by the user, once. Finishing locks the player's
  row (`SELECT … FOR UPDATE`), so concurrent submissions queue, and the second sees the round as already submitted.
  `GameScore.sessionId` and `XpTransaction(userId, sourceType, sourceId)` are unique as a second guard.
- Plausibility checks (`plausibility.ts`): `score ≤ Game.maxScore` (copied from the runtime manifest by the seed);
  claimed active time ≤ server wall-clock time + 5 s (accepted duration is clamped to wall-clock time); a positive
  score needs at least 1 s of play. Failing rounds are stored `flagged = true`, kept off leaderboards and personal
  bests, earn no XP, and are audit-logged (`score.flagged`). Client-side games are never fully trustworthy; the
  server-issued seed leaves room for deterministic re-simulation (input-log replay) for high-value leaderboards later.
- XP per finished round: `10 + min(20, floor(activeMinutes × 4))` for rounds of at least 10 s, capped at 300 XP per
  game per UTC day. Preview (staff QA) rounds earn nothing and do not count as plays.
- Level `n` requires `100 × n × (n − 1) / 2` total XP (100 for L2, 300 for L3, 600 for L4 …). The functions live in
  `@suresh/shared-types` so the web shows exactly what the API enforces.
- Score, stats, best score, XP ledger and level are written in a single database transaction.
- Leaderboards: all-time boards read `UserGameStat.bestScore` (indexed; ties go to whoever reached it first via
  `bestScoreAt`); rolling week/day boards take each player's best unflagged score in the window. Suspended players are
  hidden. Results are cached for 30 s and invalidated when a ranked score is submitted.

## Progression: achievements, daily challenges, notifications

`apps/api/src/modules/progression`. Everything is derived on the server from recorded rounds; the client never claims
progress.

- **Counted rounds** (`snapshot.ts`): finished, not a staff preview, not flagged, and at least 10 s of active play.
- **Round pipeline:** `finishSession` locks the player's row, records the round and its XP, then calls
  `applyProgression` in the same transaction: daily challenge progress → achievements → (repeat while bonus XP raises the
  level, so level achievements chain) → one XP/level write → a level-up notification.
- **Achievements** are rows with declarative JSON criteria (validated by `achievementCriteriaSchema`); unknown or invalid
  criteria are skipped and logged, never guessed. The launch set lives in `packages/game-catalog/src/achievements.ts`; the
  seed creates missing ones and never overwrites admin edits.
- **Daily challenges** are generated per UTC day on first use with a date-seeded PRNG (identical on every API instance;
  `createMany … skipDuplicates` makes concurrent generation safe). Score goals use the median personal best once five
  players have one. Days with challenges scheduled by an admin get no automatic ones.
- **Notifications** are created inside the same transactions (achievement, challenge, level-up, role change, handled
  report) and capped at the newest 200 per player. The web header polls the unread count once a minute.

## Uploads

`apps/api/src/lib/images.ts`. Avatars and game thumbnails are sent as raw request bodies, sniffed by magic bytes
(PNG/JPEG/WebP/GIF), decoded by sharp with a pixel limit, checked for minimum dimensions, and re-encoded to WebP at fixed
sizes (avatar 256 px; thumbnails 320/640/960 px for `srcset`) with metadata stripped. The bytes are stored in Postgres
(`MediaImage`/`MediaVariant`: small, backed up with everything else, no extra infrastructure) and served from
`/api/v1/media/<id>/<width>.webp` with immutable caching; a new upload gets a new id and the old image is deleted.

## Administration

`apps/api/src/modules/admin` and `apps/web/src/features/admin`. Two staff roles: **moderators** (dashboard, user
moderation of regular players, report review, read-only catalog) and **admins** (also roles, games, categories,
achievements, challenges and the audit log). The server checks the role on every request; the web hides what a role
can't use only for convenience. Guardrails: no one changes their own role or status; the last active admin can't be
suspended, demoted or deleted; destructive operations are refused when they would lose history (published games, games
with play history, categories in use, achievements or challenges players already earned); every change is audit-logged.
