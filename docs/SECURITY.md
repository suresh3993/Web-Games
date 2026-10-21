# Security checklist

Status key: ✅ implemented and tested · 🟡 implemented, not automatically tested · ⏳ planned (milestone)

## Authentication & sessions

- ✅ Argon2id password hashing (OWASP parameters); plaintext passwords are never stored or logged
- ✅ Length-based password policy (10–128 characters); the maximum bounds hashing cost
- ✅ Session token: 256-bit random, HttpOnly, SameSite=Lax, Secure in production, `__Host-` prefix over HTTPS
- ✅ Only SHA-256 hashes of session, verification and reset tokens are stored
- ✅ Sliding session expiry (default 7 days idle) with a 30-day absolute cap; expired sessions are deleted
- ✅ Logout, logout-everywhere, and revocation of all sessions on password reset
- ✅ Suspended accounts cannot log in, and their existing sessions stop working immediately
- ✅ Email verification and password reset tokens: single use (atomic conditional update), expiring (24 h / 1 h), type-bound
- ✅ No account enumeration: identical responses for register, forgot-password and login failures; dummy hash on unknown emails; emails sent asynchronously
- ✅ Rate limits: login per IP (30/15 min) and per account (10 failed/15 min), register, email actions, token submission, global per-IP ceiling
- ✅ Rate limiting survives Redis outages (falls back to per-instance memory)
- ✅ Session rotation on login
- 🟡 Reset/verification tokens are stripped from the URL after use (limits history and Referer leakage)

## Authorization

- ✅ Server-side `requireAuth` / `requireRole` / `requireVerifiedEmail` guards; the role is re-read from the DB on every request
- ✅ Role cannot be set through any public endpoint (mass-assignment test)
- ⏳ M6: admin routes, confirmation for destructive actions, audit trail for all admin changes

## Request handling

- ✅ Zod validation for every body, query and path parameter; field-level error responses
- ✅ JSON body limit of 100 KB; malformed JSON returns 400
- ✅ CSRF: Origin allowlist plus double-submit token
- ✅ CORS allowlist (`CORS_ORIGINS`) with credentials
- ✅ Helmet security headers; the API CSP is `default-src 'none'`
- ✅ Centralised error handler; no stack traces or internals in responses; request IDs
- ✅ Prisma parameterised queries only. Raw SQL is limited to Prisma's tagged templates (bound parameters): the rolling
  leaderboard window, the per-player row lock, and the play-count increment; plus the test helper's TRUNCATE of known
  table names
- ✅ Per-account rate limits for gameplay: round starts and submissions (120 per 15 min each), reports (10 per hour).
  `RATE_LIMIT_MULTIPLIER` scales only volume limits (general API and gameplay), never login/registration/token limits
- ✅ Open-redirect protection on `?next=` after login
- 🟡 Web CSP in Nginx: no inline scripts; styles allow `'unsafe-inline'` because Sonner injects a style tag
- 🟡 Logs redact cookies, authorization, CSRF header, passwords and tokens

## Data & secrets

- ✅ Secrets only from environment variables; `.env` is git-ignored; `.env.example` contains no real secrets
- ✅ No default admin. One is seeded only if `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` are set and pass the policy
- ✅ Separate test database; the test config refuses to run if it equals `DATABASE_URL`
- ✅ Audit log for registration, login (success and failure), logout, verification, reset requests and resets,
  flagged scores (`score.flagged`), game reports (`game.reported`) and publishing (`game.published`)
- ⏳ M5+: account deletion and personal-data export endpoints

## Games & content

- ✅ All catalog entries are original, in-house concepts with no trademarked names (see GAME_TRACKER)
- ✅ Games run in the browser only; no user-supplied code runs on the server
- ✅ Contract rule: modules may not use `Math.random`, cookies, storage, network, navigation, `eval` or inline event
  handlers, enforced by an automated test over all game code
- ✅ Typed input never reaches the DOM as markup: DOM games escape text (`esc`), letter games accept only `[a-z]`, and
  the contract test types `<pv-xss>` into every game and asserts no such element appears
- ✅ A crashing game is contained: the kit reports the error to the player page (End round / Restart) instead of
  freezing, and the contract and browser smoke tests fail on any game error
- ✅ Launching a game requires a logged-in account with a verified email, checked by the API when the round starts
- ✅ Scores only through a server-issued session, accepted exactly once (row lock + unique keys; concurrent replays
  tested). Duration bounded by server wall-clock time; scores above the game's ceiling, impossible durations and
  instant scores are flagged (hidden from leaderboards and bests, no XP, audit-logged)
- ✅ XP caps: at most 30 XP per round, none for rounds under 10 s, at most 300 XP per game per day; flagged and preview
  rounds earn nothing; the XP ledger's unique source key prevents double rewards
- ✅ Staff preview of unpublished games never creates scores, stats, XP or play counts (tested)
- ✅ Games are published only after passing the browser smoke test, by script, with an audit entry per game
- ⏳ Server-side replay verification of high-value scores (the per-round server seed makes it possible)
- ⏳ External games (if ever added): verified licence, sandboxed iframe, restrictive `frame-src`, fallback UI

## Supply chain

- ✅ `npm audit`: 0 known vulnerabilities at the time of writing (overrides: `deepmerge-ts@8` for the Prisma CLI, `esbuild@0.28` for tsup, `vite@7` everywhere)
- ✅ Lockfile committed; CI runs `npm audit --audit-level=high`

## Production checklist (operator)

- [ ] Serve over HTTPS; enable HSTS in `docker/nginx/nginx.conf`; leave `COOKIE_SECURE` unset or set it to `true`
- [ ] Set `TRUST_PROXY` to the number of proxy hops so rate limits see real client IPs
- [ ] Use a real SMTP provider with SPF, DKIM and DMARC
- [ ] Strong unique `POSTGRES_PASSWORD`; restrict database and Redis network access; enable Redis AUTH
- [ ] Automated database backups with tested restores (see DEPLOYMENT.md)
- [ ] Set `API_DOCS_ENABLED=false` unless the docs should be public
