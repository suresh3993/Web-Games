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
| GET | `/users/me` | user | Profile: current user plus stats (rounds, games played, play time, wins, achievements, challenges, global rank, level bounds) |
| PATCH | `/users/me` | user | `{ displayName }` (unknown fields such as `role` are ignored) |
| PUT / DELETE | `/users/me/avatar` | user | Raw image body (PNG/JPEG/WebP/GIF, ≤ 2 MB, ≥ 64×64); re-encoded to a 256 px WebP |
| POST | `/users/me/password` | user | `{ currentPassword, newPassword }`; signs out every other session; emails a notice |
| GET | `/users/me/export` | user | Personal-data export as a JSON attachment (no password, session or token hashes); 5/hour |
| DELETE | `/users/me` | user | `{ password }`; deletes the account and personal data (reports and audit entries kept, unlinked); the last admin cannot |
| GET | `/users/me/achievements` | user | Every achievement with the player's progress and unlock date |
| GET | `/achievements` | — | Public catalog of active achievements with unlock counts |
| GET | `/challenges/daily` | optional | Today's (UTC) challenges; progress for logged-in players |
| POST | `/challenges/:id/progress` | user | Recomputes progress on one of today's challenges from recorded rounds (no client-supplied amount) |
| GET | `/notifications` | user | `unread`, `page`, `pageSize`; newest first |
| GET | `/notifications/unread-count` | user | `{ unread }` |
| POST | `/notifications/:id/read`, `/notifications/read-all` | user | Idempotent |
| GET | `/media/:id/:width.webp` | — | Uploaded image variants; immutable, `nosniff`, own rate limit |

### Administration

All `/admin` routes require a staff role, checked on the server for every request (the role is re-read from the
database each time). Writes are rate-limited per account and recorded in the audit log.

| Method | Path | Role | Notes |
|---|---|---|---|
| GET | `/admin/dashboard` | moderator | Users, active users (1/7/30 days), launches, top games, category performance, 30-day series, health |
| GET | `/admin/users`, `/admin/users/:id` | moderator | Search (`q`, `role`, `status`, `sort`); detail with stats and recent activity |
| PATCH | `/admin/users/:id/status` | moderator | `{ status, reason }`. Moderators act on regular players only; nobody on themselves; never the last admin. Suspension signs the user out and emails the reason |
| PATCH | `/admin/users/:id/role` | admin | `{ role }`. Never your own role; never demotes the last admin. The user is notified |
| GET / PATCH | `/admin/reports`, `/admin/reports/:id` | moderator | Review queue; resolving or dismissing notifies the reporter |
| GET | `/admin/games`, `/admin/games/:id` | moderator | Every status; includes `previewTested` |
| POST / PATCH / DELETE | `/admin/games[/:id]` | admin | Create entries (DRAFT/COMING_SOON; runtimes ship with the code), edit metadata and categories, change status. **Publishing requires a runtime and a finished staff preview round of that game on this deployment.** Delete only unpublished entries without history or reports |
| PUT / DELETE | `/admin/games/:id/thumbnail` | admin | Raw image ≤ 5 MB, ≥ 320×200 → WebP at 320/640/960 px (`thumbnailSrcSet` in public responses) |
| GET / POST / PATCH / DELETE | `/admin/categories[/:id]` | moderator reads, admin writes | Delete only if no game uses it as main category and no challenge refers to it |
| GET / POST / PATCH / DELETE | `/admin/achievements[/:id]` | admin | Criteria validated (`rounds_played`, `distinct_games`, `wins`, `score_at_least`, `level_reached`, `play_minutes`, `category_games`, `daily_challenges`); unlocked achievements can only be deactivated |
| GET / POST / PATCH / DELETE | `/admin/challenges[/:id]` | admin | Date range (default ±7 days); days with scheduled challenges get no automatic ones; completed challenges can't be deleted |
| GET | `/admin/audit-logs` | admin | Filters: `action` prefix, `actorId`, `targetType`, `targetId`, `from`, `to` |

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

### Progression rules

- **Counted rounds.** Achievements and daily challenges count rounds that finished, were not staff previews, passed the
  plausibility checks and lasted at least 10 seconds (the same bar as XP), so instant start-and-quit rounds can't be farmed.
- **Achievements** are evaluated on the server from recorded rounds, in the same transaction as the round. Unlocks are
  idempotent (primary key per player and achievement), their XP goes through the XP ledger (unique source key), and
  level achievements chain when bonus XP raises the level. The round result lists what was unlocked.
- **Daily challenges** (UTC days): three are generated on first use, deterministically from the date (a rounds goal, a
  category goal, and a game goal that asks for a score near the game's median personal best once at least five players
  have one). Progress is always recomputed from that day's counted rounds; completion awards XP once.
- **Notifications** are created for achievements, completed challenges, level-ups, role changes and handled reports;
  the newest 200 per player are kept.

The OpenAPI document covers every route (enforced by `apps/api/test/openapi.test.ts`).
