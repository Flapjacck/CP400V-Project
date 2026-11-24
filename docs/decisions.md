# Decisions

Big calls only: why we picked a package, or how a key piece of logic works. Cloud trade-offs are in Notion section 4.

## Backend in TypeScript
Same language as the frontend, and Fastify has good types. Cost: a build step, done in the Dockerfile.

## Routes load with @fastify/autoload
Each feature is its own file under `src/routes/`, so adding auth, tracks or likes doesn't touch `app.ts`.

## MinIO image in Compose
The official `minio/minio` and `minio/mc` images are no longer on Docker Hub. We use `cgr.dev/chainguard/minio`, pinned by digest, and `amazon/aws-cli` to create the `audio` bucket.

## Plain SQL with pg, no ORM
Schema lives in `db/init/` and the API uses the `pg` driver with parameterised queries. That matches Supabase Postgres without dragging in an ORM or migration runner. Trade-off: init scripts only run on a fresh volume, so local schema changes need `docker compose down -v`.

## Auth: bcryptjs, @fastify/jwt and a hashed refresh cookie
Passwords use bcryptjs at cost 10 so the backend stays pure JS on Alpine and can verify the admin seed's `$2a$10$` hashes from pgcrypto. Access tokens are 15 minute JWTs with only user id and role. The refresh token is a random cookie with HttpOnly and SameSite=Strict; only its SHA-256 hash is stored in Postgres so a DB leak does not expose sessions. `COOKIE_SECURE` turns on the Secure cookie flag in production instead of guessing from `NODE_ENV`, since the Dockerfile sets production locally too.

## Audio streams through Fastify in the prototype
Playback goes through the API so the browser only talks to the edge URL. Presigned S3 URLs are the cloud design, but they target one host and MinIO has no public port on `data`. The storage helper is still the real AWS SDK so only the endpoint changes for production S3.

## GitHub Actions CI (Nov 2025)
Two workflows on PRs and `main`: backend runs unit tests, `tsc`, and replays `db/init/` against Postgres 16; frontend runs Vite build and oxlint. Database checks live in the backend workflow because the schema and seeds are what the API depends on. Path filters skip unrelated edits; `workflow_dispatch` allows a manual run.
