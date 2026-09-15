# Production image for raqaba-helpdesk (Next.js 16 + Prisma).
#
# Uses `output: "standalone"` (next.config.js) so the final image ships only
# the traced production dependencies instead of the full node_modules.
#
# Node 22 on Debian slim, not Alpine — Prisma's query engine has known
# musl/glibc friction on Alpine; slim avoids that class of issue entirely at
# the cost of a slightly larger base image.
#
# npm install uses --legacy-peer-deps, not `npm ci`: @sentry/nextjs's
# @sentry/webpack-plugin peer-depends on webpack, which Next 16 (Turbopack)
# never installs — `npm ci` fails on a from-scratch install for exactly this
# reason (confirmed; see the same workaround in .github/workflows/ci.yml).

FROM node:22-slim AS base
# openssl: required by Prisma's query engine binary at both generate-time
# and runtime on Debian-based images.
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
# SENTRY_* are intentionally NOT passed as build args — without
# SENTRY_AUTH_TOKEN, @sentry/nextjs skips source-map upload rather than
# failing the build (see next.config.js), so a build with no Sentry
# configuration at all still succeeds.
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Non-root runtime user — standard Next.js Docker practice.
RUN groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs

# Standalone server + static assets + public files.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Schema + migrations, needed so docker-entrypoint.sh can run
# `prisma migrate deploy` on boot without reaching out to the network.
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/prisma/migrations ./prisma/migrations

# Full node_modules layered on top of the standalone trace above, not just
# node_modules/prisma + @prisma cherry-picked — the `prisma` CLI's own
# transitive dependencies get hoisted outside the @prisma/ scope by npm's
# flat install layout, so cherry-picking only those two paths silently
# missed some of them: the image built fine and the container started, but
# `prisma migrate deploy` failed inside docker-entrypoint.sh and the
# container never became healthy (confirmed via a real CI run). Directory
# COPY layers on top of what's already there rather than replacing it, so
# this only fills in what the standalone trace left out.
COPY --from=deps /app/node_modules ./node_modules

COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh \
    && mkdir -p uploads \
    && chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

# /api/health runs a real `SELECT 1` against the database (see
# src/app/api/health/route.ts) — a process that's up but can't reach its
# database is reported unhealthy, not just "the port is open".
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
