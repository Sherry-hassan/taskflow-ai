# TaskFlow AI

MERN-stack project management app with AI-powered task planning, risk analysis, and progress summaries. See `CLAUDE.md` and `docs/` for the full approved specification set.

## Repository layout

npm workspaces monorepo:
* `server/` — Node.js + Express API.
* `client/` — React + Vite SPA.

## Prerequisites

* Node.js **22.12+, 24.x, or 26+** (exact range enforced by the root `package.json`'s `engines` field, driven by `vitest@5`'s own `engines` requirement — Node 20.x and Node 23.x are *not* supported, even though `vite`/`@vitejs/plugin-react` alone would tolerate 20.19+). This repo's CI and local development both use Node 24.
* npm 10+ (ships with Node 18.17+; the Node versions above all include a compatible npm).
* MongoDB running as a **replica set** (even a single-node one). Multi-document transactions used by this project (see `docs/architecture/system-design.md` §1) are not supported on a standalone `mongod` — a plain standalone instance is not a supported target for local development, CI, or production.

### Local MongoDB replica-set setup

Using a local `mongod` binary:

```sh
mkdir -p ~/data/taskflow-rs
mongod --replSet rs0 --dbpath ~/data/taskflow-rs --port 27017
```

In a separate terminal, initialize the replica set once:

```sh
mongosh --port 27017 --eval "rs.initiate()"
```

After that, `mongodb://localhost:27017` (used as `MONGODB_URI` in `server/.env`) is replica-set-enabled and transactions will work.

**This `mongod` process must stay running** for the server to connect — it's a long-lived process, not a one-off command. Run it in its own terminal (or as a background/service process) and leave it up for the duration of local development; if it's stopped, `npm run start --workspace server` will fail with `ECONNREFUSED` until it's started again.

If port 27017 is already in use (e.g., by another MongoDB installation on your machine), pick a different port for both the `mongod --port` flag and `mongosh --port` above, and update `MONGODB_URI` in `server/.env` to match — e.g. `mongodb://127.0.0.1:<port>/taskflow_dev?directConnection=true`.

A managed replica set (e.g. MongoDB Atlas) satisfies this requirement automatically, runs independently of your machine, and needs no local setup or long-lived local process.

## Install

```sh
npm ci
```

## Verify (lint, build, test)

```sh
npm run lint
npm run build
npm test
```

Each command runs across both workspaces (`client` and `server`) via `--workspaces --if-present`.

## Run the server locally

```sh
cp server/.env.example server/.env
# edit server/.env and set MONGODB_URI to your replica-set-enabled instance
npm run start --workspace server
```

## Run the client locally

```sh
npm run dev --workspace client
```
