# Backend

Fastify API in TypeScript.

## Environment

| Variable | Purpose |
| -------- | ------- |
| `DATABASE_URL` | Postgres URL (app role, not superuser) |
| `S3_ENDPOINT` | S3 API URL (`http://minio:9000` in Compose) |
| `S3_BUCKET` | Bucket name (default `audio`) |
| `S3_REGION` | AWS region string for the SDK |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | Credentials (MinIO root user in Compose) |
| `JWT_SECRET` | Signing key for access tokens (at least 32 characters) |
| `COOKIE_SECURE` | Set `true` to add the Secure flag on refresh cookies (default off locally) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Seeded admin user (email must be lowercase; used by `db/init`) |

Compose sets these from `.env`. For `pnpm dev` on the host, export the same vars (or point `DATABASE_URL` at a local Postgres).

## Auth routes

| Method | Path | Notes |
| ------ | ---- | ----- |
| POST | `/api/auth/signup` | Create user; returns access token and sets refresh cookie |
| POST | `/api/auth/login` | Same response shape; **5 requests per minute per IP** (429 after that) |
| POST | `/api/auth/refresh` | Uses the refresh cookie; returns a new access token and the current user |
| POST | `/api/auth/logout` | Revokes this browser's refresh token; always 204 |

## Profile routes

| Method | Path | Notes |
| ------ | ---- | ----- |
| GET | `/api/me` | Current user (includes email and `createdAt`); 401 if the token or user is gone |
| PATCH | `/api/me` | Update `displayName` and/or `bio` only; `role`, `email` and unknown fields are 400 |

## Layout

- `src/routes/` holds one file per route, grouped by area (for example `routes/auth/login.ts`). Autoload picks them up. Folder names do not change the URL, so each file writes its full `/api/...` path.
- `src/plugins/` wires shared things into the app once at startup: `db`, `auth` (JWT, cookies, `authenticate`, `requireAdmin`), `storage` and `rate-limit`. Routes use them through `fastify.db`, `fastify.storage` and so on.
- `src/lib/` holds plain functions with no Fastify setup, so routes and tests can import them directly:
  - `env.ts`: `requireEnv` for required settings
  - `db.ts`: `Queryable` (pool or transaction client) and `isUniqueViolation`
  - `users.ts`: `UserRow`, `USER_COLUMNS`, `findUserById`, `updateUserProfile`, `toUserJson`, `userResponseSchema`
  - `passwords.ts`: `hashPassword`, `verifyPassword`, `newPasswordSchema`
  - `tokens.ts`: refresh tokens, cookie helpers and `signAccessToken`
  - `schemas.ts`: `errorSchema` and `authResponseSchema`
  - `storage.ts`: `Storage` class used by the plugin and scripts
- `src/scripts/storage-smoke.ts` is a put/get/delete check against MinIO; builds to `dist/scripts/storage-smoke.js`

New code that other routes could use goes in `lib/`. Do not put helpers inside `routes/`, or autoload will try to load them as routes.

## Run locally

```sh
pnpm install
pnpm dev
pnpm test
```

## Run in Docker

```sh
docker build -t backend ./backend
docker run -p 3000:3000 backend
curl localhost:3000/api/health
```

Health example:

```json
{"status":"ok","db":"ok","storage":"ok"}
```

Returns **503** with `status: "degraded"` if Postgres or storage is unreachable. Set `PORT` to change the listen port.