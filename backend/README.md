# Backend

Fastify API in TypeScript.

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

Should return `{"status":"ok"}`. Set `PORT` to change the port.
