# Frontend

React + Vite app in TypeScript. In Docker, Nginx serves the build and proxies `/api` to the backend.

## Run locally

```sh
pnpm install
pnpm dev
```

## Run in Docker

```sh
docker build -t frontend ./frontend
docker run -p 8080:8080 frontend
```

Open `localhost:8080`. `/api` calls only work when the full stack runs with `docker compose up` from the repo root.
