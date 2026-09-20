# Build with bun, run with node (Next.js standalone).
FROM oven/bun:1.3 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile || bun install

FROM oven/bun:1.3 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN cd apps/web && bunx prisma generate && bun run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
# Next standalone bundle + static assets + prisma engines.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/prisma ./apps/web/prisma
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
