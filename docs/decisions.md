# Decisions

Big calls only: why we picked a package, or how a key piece of logic works. Cloud trade-offs are in Notion section 4.

## Backend in TypeScript
Same language as the frontend, and Fastify has good types. Cost: a build step, done in the Dockerfile.

## Routes load with @fastify/autoload
Each feature is its own file under `src/routes/`, so adding auth, tracks or likes doesn't touch `app.ts`.

## MinIO image in Compose
The official `minio/minio` and `minio/mc` images are no longer on Docker Hub. We use `cgr.dev/chainguard/minio`, pinned by digest, and `amazon/aws-cli` to create the `audio` bucket.
