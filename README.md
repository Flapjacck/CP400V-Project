# CP400V prototype

Audio streaming platform (see the course repo plan and Notion). Everything runs in Docker Compose.

## Prerequisites

- Docker Engine and Docker Compose

## Setup

```sh
cp .env.example .env
docker compose up --build
```

App: [http://localhost:8080](http://localhost:8080)

```sh
curl http://localhost:8080/api/health
# {"status":"ok","db":"ok","storage":"ok"}
```

## Sign up

```sh
curl -i -c cookies.txt \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"password123","displayName":"You"}' \
  http://localhost:8080/api/auth/signup
```

Response **201**: `{ "accessToken": "...", "user": { "id", "email", "displayName", "bio", "role" } }`. The `refresh_token` cookie is set for `/api/auth`.

Copy `.env.example` to `.env` and set at least `APP_DB_USER`, `APP_DB_PASSWORD`, `S3_BUCKET`, `S3_REGION`, and `JWT_SECRET` (32+ characters; defaults are fine for local work).

## What’s in the stack

| Service  | Role in the prototype        |
| -------- | ---------------------------- |
| frontend | Nginx + React (stand-in for CloudFront, the load balancer and the S3 frontend bucket) |
| backend  | Fastify API (EKS stand-in)   |
| db       | Postgres 16, init SQL in `db/init/`, `pgdata` volume (Supabase stand-in) |
| minio    | S3-compatible audio storage (`audio` bucket); no host port |

Only port **8080** is published to the host. Backend, Postgres, and MinIO sit on an internal `data` network.

## Database

Open a shell in Postgres:

```sh
docker compose exec db psql -U postgres -d app
```

List tables: `\dt`

Init scripts in `db/init/` run only the first time the `pgdata` volume is created. After schema changes, reset data:

```sh
docker compose down -v
docker compose up --build
```

The backend connects as the limited `APP_DB_USER` role (no DDL). Admin user comes from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env`.

## Storage

MinIO holds the `audio` bucket (name from `S3_BUCKET` in `.env`). The backend uses the AWS SDK with `S3_ENDPOINT` pointed at MinIO.

Smoke test from the running backend container:

```sh
docker compose exec backend node dist/scripts/storage-smoke.js
```

## Continuous integration

GitHub Actions runs on pull requests and pushes to `main`:

| Workflow | What it checks |
| -------- | -------------- |
| [Backend](.github/workflows/backend.yml) | `pnpm test`, `pnpm build`, applying `db/init/` to Postgres 16 (schema, app role, admin seed), building the backend image, and `docker compose config` |
| [Frontend](.github/workflows/frontend.yml) | `pnpm build`, `pnpm lint` and building the frontend image (unit tests not added yet) |

Each workflow only runs when files under that service change. The backend workflow also runs for `db/`, `docker-compose.yml` and `.env.example`. Use **Actions → Run workflow** to trigger either one manually.