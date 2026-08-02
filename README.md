# e-SAPS — Deployment & Operations Guide

**e-SAPS** (Electronic Security & Permits Management System) — Administration
Facility Gateway Access Control. This directory (`web/`) is the **deployable unit**:
a NestJS API (strict Clean Architecture) + a React (Vite) SPA served by nginx,
backed by PostgreSQL 17 and Redis 7. Everything ships as containers via Docker
Compose.

> This document is the hand-off reference for the DevOps team. It assumes no prior
> knowledge of the project internals — only Docker familiarity.

---

## 1. Architecture at a glance

```
                        ┌──────────────────────────────────────────────┐
   Internet  ──HTTPS──▶ │  Traefik (shared ingress, TLS via Let's Encrypt)
                        └───────────────┬──────────────────────────────┘
                                        │  (network: web, external)
                        ┌───────────────▼──────────────┐
                        │  frontend  (nginx:1.27-alpine)│  ← the ONLY public entrypoint
                        │  • serves the built SPA       │
                        │  • reverse-proxies /api ──────┼──┐  (same-origin, no CORS)
                        └───────────────────────────────┘  │
                          (network: esaps-net, private)     │
                        ┌───────────────────────────────┐  │
                        │  backend  (node:22, NestJS)    │◀─┘  listens on :3000
                        │  • JWT keys mounted read-only  │
                        └──────┬───────────────┬─────────┘
                               │               │
                    ┌──────────▼──────┐  ┌─────▼──────────┐
                    │ postgres:17     │  │ redis:7        │   ← no host ports,
                    │ (pgdata volume) │  │ (redisdata vol)│     private network only
                    └─────────────────┘  └────────────────┘
```

**Key properties**
- **Datastores are never exposed to the host or the internet.** Postgres and Redis
  attach only to the private `esaps-net` bridge; the backend reaches them by service
  name (`postgres:5432`, `redis:6379`).
- **The frontend nginx is the single public surface.** It serves the static SPA and
  reverse-proxies `/api/*` to the backend, so browser traffic is same-origin
  (no CORS needed in the default topology).
- **Secrets are never baked into images.** They are injected from `.env` at runtime;
  the JWT key pair is mounted read-only. `.dockerignore` excludes `.env`, `*.pem`,
  `*.key`, `*.crt`, `node_modules`, and `dist` from all image layers.

---

## 2. Repository layout (this `web/` directory)

```
web/
├── Dockerfile                    # Backend image (multi-stage, non-root)
├── docker-compose.yml            # Base stack — production-safe (no datastore host ports)
├── docker-compose.override.yml   # DEV ONLY — publishes 5440→5432 / 6385→6379 (auto-merged)
├── docker-compose.prod.yml       # Production stack — Traefik + TLS + migrate/seed runner
├── .dockerignore                 # Keeps secrets & bulk out of image layers
├── .env.example                  # Fully-documented environment template (copy to .env)
├── package.json                  # NestJS API — scripts: build, start:prod, test
├── nest-cli.json / tsconfig*.json
├── prisma/
│   ├── schema.prisma
│   ├── migrations/               # 11 migrations — applied with `migrate deploy`
│   ├── manual/001_db_level_guards.sql   # DB-level CHECK + append-only audit trigger
│   ├── seed.ts                   # Bootstraps the 3 admin accounts
│   └── seed-test-employee.ts / backfill-full-name-normalized.ts
├── src/                          # NestJS source (domain / application / data / presentation)
└── frontend/
    ├── Dockerfile                # Frontend image → nginx serving the Vite build
    ├── nginx.conf                # SPA fallback + gzip + /api reverse-proxy
    ├── .env.example              # VITE_API_BASE_URL (default '/api')
    └── src/                      # React 19 + Vite SPA
```

---

## 3. Prerequisites

- **Docker Engine 24+** and **Docker Compose v2** (`docker compose`, not the legacy
  `docker-compose`).
- For the production stack: a running **Traefik** instance joined to an external
  Docker network named `web`, and a DNS record pointing your domain at the host.
  The default router rule targets `police.moi-sy.online` — edit the Traefik labels
  in `docker-compose.prod.yml` to match your domain.

No Node.js, Postgres, or Redis needs to be installed on the host — everything runs
in containers.

---

## 4. Configuration

### 4.1 Create the environment file

```bash
cp .env.example .env
```

Then fill in **every** value marked `[required]` / `(secret)`. The template
(`.env.example`) documents each variable, its format, and its default. Never commit
the real `.env`.

**Required secrets to generate:**

```bash
# AES-256 field-encryption key (32 bytes / 64 hex chars)
openssl rand -hex 32          # → AES_KEY_HEX

# Deterministic search-hash key — MUST differ from AES_KEY_HEX
openssl rand -hex 32          # → SEARCH_HASH_KEY_HEX

# Barcode HMAC signing secret
openssl rand -hex 32          # → BARCODE_HMAC_SECRET
```

**Required datastore credentials** (the same values are used by the `postgres`/`redis`
containers and by the backend's connection strings — Compose keeps them consistent):
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `REDIS_PASSWORD`.

**Required seed passwords** (each must satisfy the policy: ≥ 12 chars; 3 of 4 of
lower/upper/digit/symbol; not a common password — the seed refuses otherwise):
`SEED_SUPER_ADMIN_PASSWORD`, `SEED_BRANCH_HEAD_PASSWORD`, `SEED_HR_PASSWORD`.

> In the container topology, Compose overrides `DATABASE_URL` / `REDIS_URL` to the
> internal service names, so the `localhost` values you may put in `.env` for local
> development are ignored inside the containers. You do **not** need to edit the URLs
> for production.

### 4.2 Generate the JWT signing key pair

The API signs tokens with RS256. Generate the pair **into this directory** (the
compose files mount them read-only into the backend at `/app/jwt-*.pem`):

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out jwt-private.pem
openssl rsa -in jwt-private.pem -pubout -out jwt-public.pem
```

Then point the API at them in `.env`:

```
JWT_PRIVATE_KEY_PATH=./jwt-private.pem
JWT_PUBLIC_KEY_PATH=./jwt-public.pem
```

(Alternatively, provide the keys inline via `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY`
with newlines escaped as `\n`.)

---

## 5. Running the stack

### 5.1 Production (behind Traefik) — recommended

```bash
# 1) Build and start backend + frontend + postgres + redis
docker compose -f docker-compose.prod.yml up -d --build

# 2) One-shot: apply migrations, then seed the 3 admin accounts
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate

# 3) One-shot, RUN ONCE ONLY: install DB-level guards
#    (non-idempotent — vehicle CHECK constraint + append-only audit trigger).
#    Do NOT chain this into step 2.
docker compose -f docker-compose.prod.yml --profile tools run --rm \
  migrate npx prisma db execute \
  --file prisma/manual/001_db_level_guards.sql --schema prisma/schema.prisma
```

Traefik routes `https://<your-domain>` to the frontend nginx, which serves the SPA
and proxies `/api` to the private backend.

### 5.2 Standalone (no Traefik) — publishes port 80 directly

Use the base compose file on its own with an explicit `-f` so the dev override is
**not** auto-merged (the override would expose the datastores on the host):

```bash
docker compose -f docker-compose.yml up -d --build
# then run the migrate/seed and DB-guards one-shots as in 5.1,
# substituting -f docker-compose.yml
```

The app is then reachable at `http://<host>/` (frontend nginx on host port 80).

### 5.3 Local development (datastores in Docker, app on the host)

```bash
docker compose up -d postgres redis     # override auto-merges → 5440 / 6385 on host
npm ci && npx prisma generate
npm run start:dev                        # API on the host
cd frontend && npm install && npm run dev  # Vite dev server → http://localhost:5173
```

---

## 6. Database lifecycle

| Action | Command | Notes |
|---|---|---|
| Apply migrations | `prisma migrate deploy` | **Always use `deploy`, never `migrate dev`.** |
| Seed admin accounts | `prisma db seed` | Idempotent-safe bootstrap of the 3 roles. |
| Install DB guards | `prisma db execute --file prisma/manual/001_db_level_guards.sql` | **Run once.** Non-idempotent. |

> ⚠️ **Never run `prisma migrate dev` against any shared/production database.** This
> project keeps DB-level guards (a vehicle foreign-key CHECK and an append-only audit
> trigger) in `prisma/manual/001_db_level_guards.sql`, *outside* the migration
> history. `migrate dev` performs a shadow-DB drift check and will try to **reset the
> database**. `migrate deploy` simply plays the migration SQL forward — no drift
> check, no reset. The compose `migrate` runner already uses `deploy`.

The `postgres` service persists to the named volume `pgdata`; Redis persists (AOF)
to `redisdata`. Back these up as part of your host backup routine.

---

## 7. Health & observability

- **Backend health:** `GET /health` → `{ status, postgres, redis }`. It actively
  pings Postgres and Redis and returns booleans only (never connection strings or
  credentials). The `docker-compose.prod.yml` backend healthcheck already probes it;
  the frontend does not become "healthy" until the backend is.
- **Verify from the host** (standalone stack): `curl http://<host>/api/health`.
- **Logs:** `docker compose -f docker-compose.prod.yml logs -f backend frontend`.
  Application logs record event type, actor, timestamp, and result — never National
  IDs, plaintext Employee IDs, phones, passwords, tokens, or the HMAC secret.

---

## 8. Environment variables — production checklist

The authoritative, fully-commented list is in **`.env.example`**. The values that
**must** be set correctly for a real production deployment:

| Variable | Purpose |
|---|---|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Datastore credentials (shared by the DB container and the backend). |
| `REDIS_PASSWORD` | Redis AUTH; also enforced by the container via `--requirepass`. |
| `AES_KEY_HEX` | AES-256-GCM key for encrypting sensitive fields at rest. |
| `SEARCH_HASH_KEY_HEX` | HMAC search-hash key (must differ from `AES_KEY_HEX`). |
| `BARCODE_HMAC_SECRET` | Signs employee barcodes (barcode encodes the Employee ID only). |
| `JWT_PRIVATE_KEY_PATH` / `JWT_PUBLIC_KEY_PATH` | RS256 signing key pair (mounted read-only). |
| `SEED_*_PASSWORD` | Initial passwords for the 3 bootstrap admin accounts. |
| `CORS_ORIGINS` | Leave empty for the default same-origin topology. Set (comma-separated) only if a browser SPA is served from a different origin than the API. |
| `NODE_ENV` | Set to `production` (the compose files already force this in-container). |

---

## 9. Security notes (read before packaging or deploying)

- **Secrets never enter the repo or the image.** `.env`, `*.pem`, `*.key`, `*.crt`,
  and `node_modules` are excluded by `.dockerignore` and must stay out of any
  delivered archive (see §10). This clean copy of the project contains **no** secrets.
- **Change any weak/placeholder database password before production.** Enforce a
  strong `POSTGRES_PASSWORD`.
- **Rotate the seed passwords after first login.** All three seeded accounts are
  forced to change their password on first login.
- **Frontend auth token storage:** the current SPA keeps its access token in
  `sessionStorage` (XSS-exposed). This is acceptable for demo/pilot; for a hardened
  production posture, move to an httpOnly cookie or in-memory token with silent
  refresh.
- **CORS / compression:** CORS is intentionally off by default because the SPA and
  API are same-origin behind nginx; enable it only via `CORS_ORIGINS` if that changes.
  Response compression is handled by nginx (`gzip`), so no app-level compression is
  bundled.

---

## 10. Packaging for hand-off (DevOps instruction — do not commit secrets)

This copy is already secret-free, but build the delivery archive defensively so it
**never** includes secrets, local state, or build artifacts. Run from the parent of
`web/` (e.g. `e-SAPS-main/`):

```bash
tar \
  --exclude='web/node_modules' --exclude='web/frontend/node_modules' \
  --exclude='web/dist'         --exclude='web/frontend/dist' \
  --exclude='web/coverage' \
  --exclude='web/.env'         --exclude='web/frontend/.env' \
  --exclude='*.pem' --exclude='*.key' --exclude='*.crt' \
  --exclude='web/.git' \
  -czf e-saps-web-deploy.tar.gz web
```

`.env.example` and `frontend/.env.example` are intentionally **kept** (they carry no
secrets). `node_modules` is excluded on purpose — it is rebuilt inside the containers
during `docker compose build`, which is the correct, reproducible approach; shipping
host `node_modules` would bloat the archive and can break native modules across OSes.

To deploy on the server after transfer:

```bash
tar -xzf e-saps-web-deploy.tar.gz && cd web
cp .env.example .env         # then fill in real secrets (see §4)
# generate JWT keys (see §4.2), then:
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml --profile tools run --rm migrate
# DB guards (once): see §5.1 step 3
```

---

## 11. Design decisions worth knowing

- **`node:22-bookworm-slim`, not `node:18-alpine`.** Prisma's query engine needs
  `openssl`/`libssl`; on Alpine (musl) this is fragile. Debian-slim keeps the image
  small while making Prisma reliable, and the client is generated inside the Linux
  build stage so it matches the runtime.
- **No build-time API URL in the frontend.** The SPA calls `/api` on its own origin
  and nginx proxies it, so there is nothing to bake in at build time and no CORS.
  `VITE_API_BASE_URL` exists only for the atypical case of a separately-hosted API.
- **Datastores have no host ports in production.** Isolation is enforced by the
  network topology, not by application config — the only way to reach Postgres/Redis
  is from another service on the private `esaps-net`.
- **Migrations vs. manual guards are deliberately separated** so `migrate deploy`
  stays idempotent and the non-idempotent guard SQL is applied once, explicitly.
