# Deployment

> Status (2026-10-22): both images build (`docker build --target api` / `--target web`). Inside the API image the
> production bundle boots and serves `/api/v1/health` as the non-root `node` user, and sharp's native image library
> loads and re-encodes images on Alpine. The full compose `app` profile (migrate → api → web behind Nginx) has not been
> run end-to-end yet. The production build of the web app was tested in a browser with the exact Nginx
> Content-Security-Policy (via `vite preview`, see GAME_PUBLISHING.md).
>
> Known optimisation: the API image is about 820 MB. `npm prune --omit=dev` keeps every workspace's production
> dependencies, so web-only packages (React, icons) ride along (~75 MB); the Prisma CLI and engines (~180 MB) are needed
> for `prisma migrate deploy`. A per-workspace production install would trim it.

## Container images

```bash
docker build --target api -t playverse-api .    # Node 22 Alpine, non-root, healthcheck
docker build --target web -t playverse-web .    # Nginx serving the SPA, proxying /api to http://api:4000
docker build --target seed -t playverse-seed .  # one-off catalog seeding
```

## Single-host stack (docker compose)

```bash
cp .env.example .env            # set a strong POSTGRES_PASSWORD, APP_URL, SMTP_* values
docker compose --profile app up -d --build   # postgres, redis, mailpit, migrate, api, web (http://localhost:8080)
docker compose --profile app run --rm seed   # first deploy, and whenever the catalog changes
```

Startup order: `postgres` (healthy) → `migrate` (`prisma migrate deploy`, exits 0) → `api` (healthy) → `web`.

## Production requirements

- TLS terminates in front of the `web` container. Enable HSTS in `docker/nginx/nginx.conf`, unset `COOKIE_SECURE`
  (or set it to `true`), and set `TRUST_PROXY=1` (or the real hop count).
- Use a managed SMTP provider instead of Mailpit (set `SMTP_*` and `MAIL_FROM`).
- Keep `RATE_LIMIT_MULTIPLIER=1` (raise it only for automated test runs). Set `VITE_SUPPORT_EMAIL` at build time so the
  Help, Privacy and Terms pages show a contact address: `docker build --build-arg VITE_SUPPORT_EMAIL=help@example.com
  --target web .`, or put it in `.env` for `docker compose build` (compose passes it through as a build argument).
- Uploaded avatars and thumbnails live in Postgres (`media_images` / `media_variants`), so the database backup covers them.
- Create the first admin with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` on the seed run, then remove those values from
  the environment; further staff are promoted in the admin area (Admin → Users).
- Logs are JSON on stdout (pino); ship them to your log platform and correlate them with `X-Request-Id`.
- Health: `GET /api/v1/health` (200 healthy, 503 degraded) is used by Docker healthchecks.

## Database migrations

- Develop: edit `prisma/schema.prisma`, then `npm run db:migrate -- --name <change>` and commit the SQL.
- Deploy: the `migrate` service runs `prisma migrate deploy`, which applies pending migrations only.
- Prefer expand → migrate → contract changes, so the previous app version keeps working during a rollout.

## Backups

```bash
# nightly logical backup (keep at least 14 days, store off-host, encrypt at rest)
docker compose exec -T postgres pg_dump -U playverse -Fc playverse > backup-$(date +%F).dump
# restore into an empty database
docker compose exec -T postgres pg_restore -U playverse -d playverse --clean --if-exists < backup.dump
```

Test a restore regularly. A backup that has never been restored is not a backup.

## Rollback

1. Re-deploy the previous image tags for `api` and `web` (tag images with the git SHA in CI).
2. Migrations are forward-only. If a release added a destructive migration, restore the pre-release backup.
   This is why destructive schema changes ship in a later release than the code that stops using the column.
3. Check `/api/v1/health` and run the E2E smoke tests against the rolled-back environment.
