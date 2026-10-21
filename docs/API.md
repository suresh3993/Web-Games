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
| GET | `/games/:slug` | — | `DRAFT`/`UNPUBLISHED` games return 404 |
| GET | `/games/:slug/related` | — | Same primary category |

## Planned endpoints (see ROADMAP)

Gameplay (M3): `POST /game-sessions`, `PATCH /game-sessions/:id`, `POST /game-sessions/:id/finish`,
`POST /games/:id/scores`, `GET /games/:id/leaderboard`, `POST|DELETE /games/:id/favorite`,
`GET /users/me/history`, `GET /users/me/favorites`.
Progression (M4): `GET /users/me/achievements`, `GET /challenges/daily`, `POST /challenges/:id/progress`,
`GET /leaderboards/global`.
Admin (M6): `GET /admin/dashboard`, CRUD `/admin/games`, CRUD `/admin/categories`, `GET /admin/users`,
`PATCH /admin/users/:id/status`, `GET|PATCH /admin/reports`, `GET /admin/audit-logs`. These will be guarded server-side
by `requireRole()` (already implemented and tested).
