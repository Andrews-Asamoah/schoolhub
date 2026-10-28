# SchoolHub

Multi-tenant school management platform: a NestJS API (`apps/api`), a React web app (`apps/web`) and shared Zod contracts (`packages/shared`), on PostgreSQL via Prisma. Each school is reached at its own subdomain (for example `manna-int.schoolhub.gh`).

Start with [ARCHITECTURE.md](./ARCHITECTURE.md) for how the pieces fit, and [docs/plans](./docs/plans) for the phased delivery plans.

## Run it locally

Requirements: Node.js 22+, pnpm 12.4.1, Docker.

```bash
pnpm install
cp .env.example .env            # then set BETTER_AUTH_SECRET (openssl rand -base64 48)
docker compose up -d db         # PostgreSQL on localhost:5433
pnpm db:migrate                 # development migrations (prisma migrate dev)
pnpm --filter @schoolhub/api seed   # optional: creates the super admin from SUPER_ADMIN_* env vars
pnpm dev                        # web :5173, API :3001
```

Open `http://localhost:5173`. To exercise a school subdomain locally, use `http://<subdomain>.localhost:5173`.

## Checks

```bash
pnpm typecheck
pnpm --filter @schoolhub/api lint
pnpm --filter @schoolhub/api test       # database tests need TEST_DATABASE_URL, see apps/api/TESTING.md
pnpm --filter @schoolhub/web test
pnpm --filter @schoolhub/web lint:theme
```

## Configuration

Every variable is listed and explained in [.env.example](./.env.example). The API refuses to start if a required one is missing or invalid.

## Deploying

Two images are built by the **Container images** workflow (`ghcr.io/<owner>/schoolhub-api`, `ghcr.io/<owner>/schoolhub-web`) and can be built locally:

```bash
docker build -f apps/api/Dockerfile -t schoolhub-api --build-arg BUILD_SHA=$(git rev-parse --short HEAD) .
docker build -f apps/web/Dockerfile -t schoolhub-web .
```

- **API** listens on `PORT` (3001). Set the variables from `.env.example`; set `TRUST_PROXY` to the number of proxies in front of it.
- **Web** is nginx serving the static build and proxying `/api/*` to `API_UPSTREAM` (default `http://api:3001`), preserving the `Host` header the API uses to find the school.
- **Probes:** `GET /api/health/live` (process is up) and `GET /api/health/ready` (database reachable, otherwise 503). `/api/health` is kept for older monitors.
- **Migrations:** never auto-run on start. Run the **Database migrations** workflow (`workflow_dispatch`, per environment) or `pnpm db:deploy` against the target database **before** rolling out an image that adds a migration. The super-admin operations report flags a database that is behind the running build.
- **Backups and restore:** see [docs/runbooks/backup-restore.md](./docs/runbooks/backup-restore.md).

## Branches

Feature work targets `dev`; `main` is release. CI runs on both.
