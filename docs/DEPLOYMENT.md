# Deployment

> Status: the Dockerfile, compose `app` profile, Nginx config and CI workflow are written but **have not yet been
> built or run** (Docker was unavailable when they were authored). Treat this as a draft until verified.

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
