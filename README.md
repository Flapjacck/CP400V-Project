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
# {"status":"ok"}
```

## What’s in the stack

| Service  | Role in the prototype        |
| -------- | ---------------------------- |
| frontend | Nginx + React (stand-in for CloudFront, the load balancer and the S3 frontend bucket) |
| backend  | Fastify API (EKS stand-in)   |
| db       | Postgres with `pgdata` volume (Supabase stand-in) |
| minio    | S3-compatible audio storage  |

Only port **8080** is published to the host. Backend, Postgres, and MinIO sit on an internal `data` network.