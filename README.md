# LiveTV

LiveTV is a browser-first media player project designed as a single interface for live TV, YouTube, IPTV, playlists, guide data, and torrent streaming sources. The application targets desktop, tablet, and phone browsers and keeps heavy media work outside the UI layer.

## Current status

The repository is in **P1 — Responsive UI shell + PWA**. The project foundation is complete and the first real application shell now runs across desktop, tablet, phone portrait, and phone landscape layouts.

P1 currently includes:

- desktop sidebar navigation and large player workspace,
- tablet split layout with a compact navigation rail,
- phone-first player layout with bottom navigation and a secondary bottom sheet,
- route shells for Home, Live TV, YouTube, IPTV, Torrent, Playlists, TV Guide, History, and Settings,
- a dedicated settings shell with working in-session theme and startup-mode controls,
- semantic landmarks, skip navigation, keyboard focus states, reduced-motion support, and touch-friendly controls,
- an installable Web App Manifest with 192 px and 512 px application icons,
- a registered service worker with install/update plumbing,
- application-shell/static-asset caching that explicitly excludes API and media traffic.

Media engines are intentionally not connected in P1. Actual direct/HLS/YouTube playback begins in the next player phase; torrent streaming is implemented in its dedicated later roadmap phase.

Current workspace boundaries:

```text
apps/web                 React + Vite responsive PWA shell
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

The root development command is useful when Docker is unavailable, but it does not replace the Docker Compose acceptance check.

## Develop with Docker Compose

Start the complete development stack:

```bash
docker compose up --build
```

The normal browser entry point is Caddy:

- LiveTV: `http://localhost:8080`
- API health through Caddy: `http://localhost:8080/api/health`
- Media worker health through Caddy: `http://localhost:8080/media/health`

The stack also includes PostgreSQL 18 with a named development volume. Development-only defaults live in `.env.example`; copy them to a local `.env` only when you need overrides. `.env` files are ignored by Git.

## PWA behavior

The normal PWA development entry point is `http://localhost:8080`. Localhost is treated as a secure context by modern browsers, so the service worker can register during local development.

The PWA boundary is deliberately strict:

- `manifest.webmanifest` declares standalone display mode and the application icons.
- `sw.js` caches the application shell and safe same-origin static assets only.
- `/api/*`, `/media/*`, video destinations, and audio destinations are never intercepted for offline caching.
- Torrent, YouTube, HLS, and other media payloads are not converted into an offline media library.
- Browsers that expose `beforeinstallprompt` get the LiveTV install action; other browsers keep their native installation flow.
- A waiting service-worker update can be promoted from the application UI without silently replacing the current session.

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

P1 does not implement the media engines. In particular, this phase does not add YouTube API access, downloads or recording, torrent download/archive behavior, seeding, anonymous server media proxying, or anonymous server torrent fallback.

The next roadmap step is **P2 — Unified Player + YouTube + HLS + direct URL**, which will replace the current player placeholder with the first real playback engine while preserving the responsive shell established in P1.
