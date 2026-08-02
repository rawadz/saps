# syntax=docker/dockerfile:1

# =============================================================================
#  e-SAPS backend — multi-stage build
# =============================================================================

# ---- Build stage: install all deps and compile TypeScript --------------------
FROM node:22-bookworm-slim AS build
WORKDIR /app

# openssl present at GENERATE time so native detection matches the 3.0.x runtime.
RUN apt-get update -y && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
# Generate the Prisma client INSIDE this Linux build stage so its query engine
# matches the runtime image (same node:22-bookworm-slim base) — no binaryTargets
# needed. Without this, the runtime @prisma/client is never generated and
# `new PrismaClient()` throws "did not initialize" on boot. Must run BEFORE the
# prune below, since the `prisma` CLI is a devDependency.
RUN npx prisma generate
RUN npm run build

# NOTE: no prune here — the `build` stage intentionally keeps devDependencies
# (prisma CLI, ts-node) + full source so the migrate/seed one-shot can reuse it
# via `target: build` (see docker-compose.prod.yml).

# ---- Prune stage: runtime node_modules only ---------------------------------
FROM build AS prune
RUN npm prune --omit=dev

# ---- Runtime stage: slim, no build toolchain, non-root ----------------------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Prisma's query engine needs libssl at runtime; bookworm-slim ships without it.
# Install as root, BEFORE switching to the unprivileged "node" user below.
RUN apt-get update -y && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY --from=prune /app/node_modules ./node_modules
COPY --from=prune /app/dist ./dist

# Run as the unprivileged "node" user that ships with the base image.
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
