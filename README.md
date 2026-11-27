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

Response **201**: `{ "accessToken": "...", "user": { "id", "email", "displayName", "bio", "role", "createdAt" } }`. The `refresh_token` cookie is set for `/api/auth`.

## Log in

```sh
curl -i -c cookies.txt \
  -H 'content-type: application/json' \
  -d '{"email":"admin@example.com","password":"changeme"}' \
  http://localhost:8080/api/auth/login
```

Response **200** with the same body shape as sign up. The `refresh_token` cookie is set for `/api/auth`. Wrong email or password returns **401** with `{ "error": "Invalid email or password" }`. Login is limited to **5 tries per minute per IP**; the sixth attempt returns **429**.

## Refresh

After sign up or login, keep using the same cookie jar:

```sh
curl -i -b cookies.txt -c cookies.txt \
  -X POST \
  http://localhost:8080/api/auth/refresh
```

Response **200** with the same body shape as login (`accessToken` and `user`). The role in the new JWT comes from the database. The refresh cookie is unchanged. Missing, unknown, revoked, or expired refresh tokens return **401** with `{ "error": "Unauthorized" }` and clear the cookie.

## Log out

```sh
curl -i -b cookies.txt -c cookies.txt \
  -X POST \
  http://localhost:8080/api/auth/logout
```

Always **204** with no body. When the cookie is present, the server revokes that refresh token and clears the cookie. A later refresh then returns **401**.

## Your profile

```sh
curl -H "Authorization: Bearer <accessToken>" \
  http://localhost:8080/api/me

curl -X PATCH \
  -H "Authorization: Bearer <accessToken>" \
  -H 'content-type: application/json' \
  -d '{"displayName":"New Name","bio":"Hello"}' \
  http://localhost:8080/api/me
```

Both return **200** with `{ "id", "email", "displayName", "bio", "role", "createdAt" }`. Email is only returned to its owner.

`PATCH` accepts `displayName` (1-50 characters, trimmed) and `bio` (up to 500 characters, trimmed). Send at least one. Any other field (including `role` and `email`), an empty body, a blank `displayName` or a too-long value returns **400** (Fastify validation errors, or `{ "error": "Bad Request" }` for a blank name). A missing, invalid or expired token, or a user that no longer exists, returns **401** with `{ "error": "Unauthorized" }`.

## Change password

```sh
curl -i -b cookies.txt -c cookies.txt \
  -X POST \
  -H "Authorization: Bearer <accessToken>" \
  -H 'content-type: application/json' \
  -d '{"currentPassword":"old-password","newPassword":"new-password"}' \
  http://localhost:8080/api/me/password
```

Response **204** with no body on success. All refresh tokens for the account are revoked and this browser receives a fresh `refresh_token` cookie, so other devices are logged out on their next refresh. Access tokens already issued still work until they expire (up to 15 minutes).

A wrong current password returns **401** with `{ "error": "Current password is incorrect" }`. A missing, invalid or expired token returns **401** with `{ "error": "Unauthorized" }`.

A `newPassword` outside 8–72 characters or any extra field in the body returns **400**. More than 5 attempts per minute returns **429**.

Copy `.env.example` to `.env` and set at least `APP_DB_USER`, `APP_DB_PASSWORD`, `S3_BUCKET`, `S3_REGION`, and `JWT_SECRET` (32+ characters; defaults are fine for local work).

## Public profiles

```sh
curl http://localhost:8080/api/users/<id>
```

Response **200**: `{ "id", "displayName", "bio", "createdAt" }`. No login is required. Email and role are never included.

A non-UUID id (for example `/api/users/not-a-uuid`) returns **400** with `{ "error": ... }`. An id that is a valid UUID but not in the database returns **404** with `{ "error": "Not Found" }`.

## Upload a track

```sh
curl -X POST \
  -H "Authorization: Bearer <accessToken>" \
  -F 'title=My song' \
  -F 'description=A short description' \
  -F 'file=@song.mp3;type=audio/mpeg' \
  http://localhost:8080/api/tracks
```

Response **201**: `{ "id", "title", "description", "contentType", "sizeBytes", "playCount", "createdAt", "updatedAt", "owner" }`. Missing or invalid form fields return **400**, a missing or invalid token returns **401**, files over 50 MB return **413**, and an unsupported client or detected audio type returns **415**.

## Browse tracks

```sh
curl 'http://localhost:8080/api/tracks?limit=20&before=<track-id>'
curl http://localhost:8080/api/tracks/<track-id>
curl 'http://localhost:8080/api/users/<user-id>/tracks?limit=20&before=<track-id>'
```

All routes are public. The list routes return `{ "tracks": [ ... ], "nextBefore": "<track-id>" | null }`, newest first. `limit` is optional (default **20**, maximum **50**) and `before` is an optional track id from `nextBefore`. A track response contains `{ "id", "title", "description", "contentType", "sizeBytes", "playCount", "createdAt", "updatedAt", "owner" }`.

An invalid id, invalid query, or unknown `before` cursor returns **400**. A missing track or user returns **404**. Successful list and get requests return **200**.

## Edit or delete a track

```sh
curl -X PATCH \
  -H "Authorization: Bearer <accessToken>" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Renamed song","description":"Updated description"}' \
  http://localhost:8080/api/tracks/<track-id>

curl -X DELETE \
  -H "Authorization: Bearer <accessToken>" \
  http://localhost:8080/api/tracks/<track-id>
```

Only the owner can edit or delete a track. PATCH returns **200** with the updated track and DELETE returns **204**. Invalid input returns **400**, a missing or invalid token returns **401**, another user's track returns **403**, and a missing track returns **404**.

## Stream or download a track

```sh
curl -r 0-99 -o part.bin -D - http://localhost:8080/api/tracks/<track-id>/stream
curl -OJ http://localhost:8080/api/tracks/<track-id>/download
```

Both routes are public. Without a Range header they return **200** with the whole file. A single Range returns **206** with `Content-Range`; a bad or out-of-bounds range returns **416**. Download adds `Content-Disposition: attachment` with a filename made from the title. An invalid id returns **400**, and a missing track returns **404**.

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
