# syntax=docker/dockerfile:1.7
# SURESH multi-stage build.
#   docker build --target api -t suresh-api .
#   docker build --target web -t suresh-web .

# ---- base ---------------------------------------------------------------------
FROM node:22-alpine AS base
WORKDIR /app
# OpenSSL is required by the Prisma query engine on Alpine.
RUN apk add --no-cache openssl

# ---- deps: install with the lockfile only (cached unless manifests change) ------
FROM base AS deps
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/validation/package.json packages/validation/
COPY packages/game-runtime/package.json packages/game-runtime/
COPY packages/game-catalog/package.json packages/game-catalog/
RUN npm ci --no-audit --no-fund

# ---- build: compile API bundle and static web app ----------------------------
FROM deps AS build
COPY . .
# Browser settings are baked in at build time: docker build --build-arg VITE_SUPPORT_EMAIL=help@example.com
ARG VITE_SUPPORT_EMAIL=
ENV VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL
RUN npm run build

# ---- seed: one-off catalog seeding (has dev tooling: tsx) ---------------------
FROM build AS seed
ENV NODE_ENV=production
CMD ["npm", "run", "db:seed"]

# ---- prod-deps: runtime dependencies only --------------------------------------
FROM build AS prod-deps
# npm may nest some API dependencies (e.g. sharp and its native binaries) under apps/api/node_modules;
# make sure the folder exists so the runtime stage can always copy it.
RUN npm prune --omit=dev --no-audit --no-fund && mkdir -p apps/api/node_modules

# ---- api runtime ------------------------------------------------------------------
FROM base AS api
ENV NODE_ENV=production
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/package.json /app/prisma.config.ts ./
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD node -e "fetch('http://localhost:4000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "apps/api/dist/server.js"]

# ---- web runtime (static files + reverse proxy) -----------------------------------
FROM nginx:1.27-alpine AS web
COPY docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
