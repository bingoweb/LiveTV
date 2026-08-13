# LiveTV

LiveTV is a browser-first media player project designed to run as a normal web application and, in later phases, as an installable PWA. The binding product design targets desktop, tablet, and phone browsers and keeps heavy media work outside the UI layer.

## Current status

The repository is in **P0 — Repository and project foundation**. P0 intentionally contains only service boundaries and development infrastructure; media playback, IPTV, torrent streaming, authentication, synchronization, and the production UI arrive in later roadmap phases.

Current workspace boundaries:

```text
apps/web                 React + Vite web shell
apps/api                 Fastify API service boundary
services/media-worker    Fastify media-worker boundary
packages/shared          Shared service contracts
packages/player-core     Reserved player-core package boundary
infra/reverse-proxy      Caddy development proxy
```

## Requirements

- Node.js **22.12 or newer**; Node.js **24 LTS is recommended** and is used by CI and development containers.
- npm (the repository uses npm workspaces and one root `package-lock.json`).
- Git.
- Docker with Docker Compose for the full container development stack.

## Install

From the repository root:

```bash
npm ci
```

## Develop without Docker

Start the three JavaScript services together:

```bash
npm run dev
```

Default direct development endpoints:

- Web: `http://localhost:5173`
- API health: `http://localhost:3001/api/health`
- Media worker health: `http://localhost:3002/media/health`

The root development command is useful when Docker is unavailable, but it does not replace the P0 Docker Compose acceptance check.

## Develop with Docker Compose

Start the complete P0 development stack:

```bash
docker compose up --build
```

The normal browser entry point is Caddy:

- LiveTV: `http://localhost:8080`
- API health through Caddy: `http://localhost:8080/api/health`
- Media worker health through Caddy: `http://localhost:8080/media/health`

The stack also includes PostgreSQL 18 with a named development volume. Development-only defaults live in `.env.example`; copy them to a local `.env` only when you need overrides. `.env` files are ignored by Git.

## Verification

Run the complete local quality gate:

```bash
npm run verify
```

It runs, in order:

1. Prettier formatting check
2. ESLint
3. TypeScript type checking across workspaces
4. Vitest
5. Workspace builds
6. Direct dependency license policy check

The repository structure regression test can also be run directly:

```bash
node --test tests/repository-structure.node.mjs
```

For the container acceptance check:

```bash
docker compose config
docker compose up --build -d --wait
curl --fail http://localhost:8080/
curl --fail http://localhost:8080/api/health
curl --fail http://localhost:8080/media/health
docker compose down
```

## Dependency policy

Main project components must remain free and open source. Every direct external dependency is checked by `npm run licenses:check`; dependencies with missing or unapproved license metadata fail the command instead of being silently accepted.

GitHub pull requests also run Dependency Review, and Dependabot checks npm and GitHub Actions dependencies weekly.

## Repository license

The software license for LiveTV has **not yet been selected**. This repository being public does not by itself grant permission to copy, modify, or redistribute the source code. A project license will be chosen explicitly before a licensed release is published.

## Roadmap boundary

P0 does not implement the player or media engines. In particular, this phase does not add YouTube API access, downloads or recording, torrent download/archive behavior, seeding, anonymous server media proxying, or anonymous server torrent fallback.
