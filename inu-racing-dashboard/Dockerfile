# inu-racing-dashboard — Next.js, pnpm. Runs the same `next start` systemd already uses.
FROM node:22-slim AS builder
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# `next build` evaluates db/index.ts at module scope (it throws if DATABASE_URL is unset) while
# collecting page data for the NextAuth route — a dummy, non-functional value only satisfies that
# presence check; postgres.js connects lazily, so no real connection is attempted at build time.
# The REAL DATABASE_URL is injected only at container runtime via env_file, never baked in here.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
RUN pnpm exec next build

FROM node:22-slim
ENV CI=true
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3500
CMD ["pnpm", "exec", "next", "start", "-p", "3500"]
