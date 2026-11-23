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

Compose sets these from `.env`. For `pnpm dev` on the host, export the same vars (or point `DATABASE_URL` at a local Postgres).

## Layout

- `src/plugins/` — `db` (`pg` pool) and `storage` (S3 client helpers), registered in `app.ts` before routes
- `src/lib/storage.ts` — `Storage` class used by the plugin and scripts
- `src/scripts/storage-smoke.ts` — put/get/delete check against MinIO; builds to `dist/scripts/storage-smoke.js`

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