# API reference

Base path: `/api/v1`. The interactive OpenAPI 3.1 documentation is served at `/api/docs` (JSON: `/api/v1/openapi.json`)
when `API_DOCS_ENABLED` is true (the default outside production).

## Conventions

- Success: `{ "data": ... }`. Paginated: `{ "data": [...], "meta": { page, pageSize, total, totalPages } }`.
- Error: `{ "error": { "code", "message", "fields"?, "requestId" } }`. Codes: `VALIDATION_ERROR`, `UNAUTHENTICATED`,
  `FORBIDDEN`, `CSRF_INVALID`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `ACCOUNT_SUSPENDED`, `TOKEN_INVALID`,
  `BAD_REQUEST`, `INTERNAL_ERROR`.
- Every response carries an `X-Request-Id` header for log correlation.
- State-changing requests (POST/PUT/PATCH/DELETE) need the `X-CSRF-Token` header (from `GET /auth/csrf`) and the
  cookies set by the API. Requests with a foreign `Origin` are rejected.

## Implemented endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | — | DB and Redis status; 503 when degraded |
| GET | `/auth/csrf` | — | Issues a CSRF token and cookie |
| POST | `/auth/register` | — | Always 202 with the same message (no account enumeration) |
| POST | `/auth/login` | — | Sets the session cookie; per-IP and per-account rate limits |
| POST | `/auth/logout` | optional | Revokes the current session |
| POST | `/auth/logout-all` | user | Revokes every session of the user |
| POST | `/auth/forgot-password` | — | Always 202; emails a 1-hour single-use link |
| POST | `/auth/reset-password` | — | Consumes the token, revokes all sessions |
| POST | `/auth/verify-email` | — | Consumes a 24-hour single-use token |
| POST | `/auth/resend-verification` | user | Invalidates older links |
| GET | `/auth/me` | user | Current user |
| GET | `/games` | — | `q`, `category`, `difficulty`, `device`, `status`, `sort`, `page`, `pageSize` |
| GET | `/games/featured` | — | Cached 60 s |
| GET | `/games/trending` | — | Most launched in the last 7 days, topped up by popularity |
| GET | `/games/categories` | — | Counts include public games only |
| GET | `/games/:slug` | — | `DRAFT`/`UNPUBLISHED` games return 404. Includes `runtimeKey` (the module the player loads) |
| GET | `/games/:slug/related` | — | Same primary category |
| GET | `/games/:slug/leaderboard` | optional | `period=all\|week\|day` (rolling), `limit≤50`. Each player's best unflagged score; ties share a rank; `isYou` marks the viewer |
| GET | `/games/:slug/me` | user | Personal best, plays, play time, all-time rank, favourite flag |
| POST / DELETE | `/games/:slug/favorite` | user | Idempotent add / remove (204) |
| POST | `/games/:slug/reports` | user | `{ reason, details }`; an identical open report is not duplicated; 10/hour per account |
| POST | `/game-sessions` | verified user | `{ slug }` → `{ id, seed, preview, startedAt, personalBest }`. Launch gate: published game with a runtime, or staff preview (below). 120 per 15 min per account |
| PATCH | `/game-sessions/:id` | user (owner) | Heartbeat; 409 once the round has ended |
| POST | `/game-sessions/:id/finish` | user (owner) | `{ score, outcome, durationMs, stats }` → result with best, rank, XP, level. Exactly once per round (409 on replay) |
| GET | `/users/me/favorites` | user | Favourite games, newest first |
| GET | `/users/me/history` | user | Recently played with personal bests, plays and play time |
| GET | `/leaderboards/global` | optional | Players ranked by total XP (`limit≤100`) |

### Gameplay rules

- **Launching requires an account.** `POST /game-sessions` needs a logged-in user with a verified email, checked by the
  API (the UI only explains it). Each round gets a server-generated seed; the game's RNG is derived from it.
- **Staff preview.** Moderators and admins may start sessions for unpublished games that have a runtime
  (`preview: true`). Preview rounds never create scores, stats, XP or play counts. This is how games are QA-tested
  before publishing (see [GAME_PUBLISHING.md](GAME_PUBLISHING.md)).
- **Submitting.** Scores can only be submitted by finishing a server-issued session. The spec's free-standing
  `POST /games/:id/scores` is deliberately folded into `POST /game-sessions/:id/finish`: a score without a session
  would bypass the duration checks. Duration is clamped to server wall-clock time. A round is **flagged** (stored, but
  kept off leaderboards and personal bests, no XP, audit-logged) when the score exceeds the game's ceiling (from its
  manifest), when the claimed active time exceeds wall-clock time by more than 5 s, or when a positive score arrives
  in under 1 s.
- **XP.** 10 + 4 per active minute, at most 30 per round; rounds under 10 s earn none; at most 300 XP per game per
  UTC day. Level n needs 100 × n × (n − 1) / 2 XP. Score, stats, XP and level are written in one transaction with
  the player's row locked, and `XpTransaction(userId, sourceType, sourceId)` is unique, so nothing is awarded twice.
- **Abandoned rounds.** Sessions without a heartbeat for 15 minutes (or older than 4 hours) are closed as
  `ABANDONED` when the player starts another round, and can no longer be submitted.

## Planned endpoints (see ROADMAP)

Progression (M4): `GET /users/me/achievements`, `GET /challenges/daily`, `POST /challenges/:id/progress`.
Admin (M6): `GET /admin/dashboard`, CRUD `/admin/games`, CRUD `/admin/categories`, `GET /admin/users`,
`PATCH /admin/users/:id/status`, `GET|PATCH /admin/reports`, `GET /admin/audit-logs`. These will be guarded server-side
by `requireRole()` (already implemented and tested).
