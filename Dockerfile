# syntax=docker/dockerfile:1.7
#
# Small production image for the Next.js app (apps/web). bun installs and builds;
# the runtime is node on Alpine carrying the Next standalone bundle only — no
# package manager, no full node_modules.
#
#   docker build -t grossmargin-connect .
#
# The image does not run database migrations. Apply the schema separately with
# `bun run db:push` (see the README) before the first start and after a schema
# change.
#
# Three stages, so a source edit does not reinstall dependencies:
#   deps     node_modules from the lockfile only
#   builder  next build with standalone output
#   runner   node + the traced server and its static assets

ARG NODE_IMAGE=node:22-alpine
ARG BUN_IMAGE=oven/bun:1.3-alpine

FROM ${BUN_IMAGE} AS bun

# ---------------------------------------------------------------------------
# deps
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
# Bun installs the packages; Node runs them. Copying the one binary keeps the
# toolchain in a single layer instead of a second full base image.
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
# Manifests only. This layer stays cached until a dependency changes. Every
# workspace member's manifest is needed, or --frozen-lockfile rejects the tree.
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/package.json
# The web package's postinstall runs `prisma generate`, so the schema must be
# present during install. It also builds the query engine for this platform.
COPY apps/web/prisma apps/web/prisma
# --linker hoisted is required: bun 1.3 defaults to an isolated layout that
# Next's build-time module tracing does not follow, which silently drops
# packages from the standalone output and kills the server on first require.
RUN --mount=type=cache,target=/root/.bun/install/cache \
    bun install --frozen-lockfile --linker hoisted

# ---------------------------------------------------------------------------
# builder
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY --from=deps /app /app
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
# Prisma generates its query engine for the build platform (Alpine musl), which
# matches the runner. `bun run build` runs `prisma generate` then `next build`.
RUN cd apps/web && bun run build
# Trim the standalone bundle: the running server needs neither the TypeScript
# compiler nor sharp (no next/image). Pruning here keeps them out of the layer
# the runner copies.
RUN rm -rf apps/web/.next/standalone/node_modules/typescript \
           apps/web/.next/standalone/node_modules/@img \
           apps/web/.next/standalone/node_modules/sharp

# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
# libssl for the Prisma query engine; drop the bundled npm/corepack to slim down.
RUN apk add --no-cache openssl \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
       /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# server.js binds HOSTNAME; the default 'localhost' refuses traffic from outside.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Standalone bundle (traced node_modules + server.js), static assets, prisma schema.
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /app/apps/web/prisma ./apps/web/prisma
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
