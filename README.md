# LiveTV

LiveTV is a browser-first media player project designed as a single interface for live TV, YouTube, IPTV, playlists, guide data, and torrent streaming sources. The application targets desktop, tablet, and phone browsers and keeps heavy media work outside the UI layer.

## Current status

The repository is in **P3 — Guest Local Library**. The responsive PWA shell and P2 unified playback engine are now connected to a persistent, account-free local library.

The current implementation includes:

- desktop sidebar navigation and large player workspace,
- tablet split layout with a compact navigation rail,
- phone-first player layout with bottom navigation and a secondary bottom sheet,
- route shells for Home, Live TV, YouTube, IPTV, Torrent, Playlists, TV Guide, History, and Settings,
- one unified playback surface for direct HTTP(S) media, HLS, and YouTube,
- Plyr controls with fullscreen and PiP where the browser/provider exposes them,
- HLS.js playback with native-HLS fallback and manual quality choices when multiple levels are available,
- automatic URL classification plus a manual source-engine selector for ambiguous/extensionless URLs,
- lazy-loaded Plyr and HLS.js chunks so media engines do not inflate the initial application bundle,
- YouTube video URL parsing and embedded playback with the current LiveTV origin,
- YouTube channel/@handle live discovery through `/api/youtube/resolve-live`, preferring the official YouTube Data API when `YOUTUBE_DATA_API_KEY` is configured and automatically falling back to the channel `/live` page when the API is unavailable,
- short live/offline discovery caches with explicit manual-refresh bypass, so changing broadcast IDs are refreshed without repeatedly spending upstream requests,
- built-in quick actions for `@Halktvkanali` and `@ankahaberajans`, including a clear offline state when a channel has no active live stream,
- a YouTube Premium session mode that uses the normal `youtube.com` embed so the browser can reuse an existing signed-in YouTube/Premium session when allowed,
- a privacy-enhanced YouTube mode using `youtube-nocookie.com`, selectable from the player or Settings,
- a `YouTube’da aç` fallback for cases where the embedded player cannot reuse the signed-in session,
- a dedicated settings shell with working in-session theme/startup controls and a persistent YouTube embed-mode preference,
- semantic landmarks, skip navigation, keyboard focus states, reduced-motion support, and touch-friendly controls,
- an installable Web App Manifest with 192 px and 512 px application icons,
- a registered service worker with install/update plumbing,
- application-shell/static-asset caching that explicitly excludes API and media traffic.
- native IndexedDB persistence for playback history, favorites, and custom playlists,
- history recording only after a source reaches a real `playing` state,
- deduplicated history with a 200-entry retention limit,
- persistent favorites keyed by stable media-source identity,
- custom playlist create, rename, delete, add/remove, and explicit up/down reorder operations,
- functional History and Playlists routes that can send saved sources back into the same unified player,
- graceful library disablement when IndexedDB is unavailable without disabling playback.

Torrent streaming, M3U channel-list parsing, authentication, watch-progress resume, and cross-device sync remain later roadmap phases.

Current workspace boundaries:

```text
apps/web                 React + Vite responsive PWA shell
apps/api                 Fastify API + YouTube live-channel resolver
services/media-worker    Fastify media-worker boundary
packages/shared          Shared service contracts
packages/player-core     Source classifier + unified player controller contracts
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

For official YouTube live discovery, set the optional server-side key in `.env`:

```text
YOUTUBE_DATA_API_KEY=your-youtube-data-api-key
```

The key is passed only to the Fastify API service; it is not a Vite/client variable and must not be added as `VITE_*`. If the key is absent, LiveTV remains functional and uses the channel `/live` resolver instead.

## Unified player

Open any route that exposes the player and enter a source URL. The automatic classifier recognizes YouTube video URLs, `.m3u8` HLS manifests, common audio extensions, and direct web media. Extensionless or signed CDN URLs remain usable as direct video by default; the `Motor` selector can explicitly force HLS, YouTube, Video, or Audio when automatic detection is not enough.

YouTube channel URLs such as:

```text
https://www.youtube.com/@Halktvkanali
https://www.youtube.com/@ankahaberajans
```

are resolved to the channel's current broadcast before playback. With `YOUTUBE_DATA_API_KEY` configured, the API first resolves the channel ID with `channels.list`, searches the channel's active broadcast with `search.list`, and verifies/enriches the current video with `videos.list`. If the official API fails, LiveTV automatically falls back to the channel's `/live` page. If the official API successfully reports that the channel is offline, that result is treated as authoritative instead of scraping for a different answer.

Channel IDs are cached for a long period in the API process. Live results use a short 25-second cache and offline results a 15-second cache. Background status refreshes can use those caches; the user-facing `Yenile` action sends `refresh=1`, which bypasses only the short live/offline cache while retaining the stable channel-ID lookup. Channel playback also forces a fresh resolution before loading, and a failed channel-based player load receives at most one additional fresh discovery/retry.

### YouTube Premium session mode

`YouTube oturumunu kullan` is enabled by default and can be changed from the player or Settings. In this mode LiveTV uses the normal `youtube.com` embed host. If the browser allows the embedded frame to see the user's existing signed-in YouTube session, YouTube can apply the account's Premium benefits. Browsers may block or partition cross-site session cookies, so LiveTV does not claim that Premium recognition can be guaranteed inside every embed. The `YouTube’da aç` action remains available as a reliable account-session fallback.

The alternate privacy mode switches the embed back to `youtube-nocookie.com`.

## Guest local library

P3 stores personal library data in the browser's native IndexedDB database named `livetv-library`. This data is local to the current browser profile and does not require an account.

Playback history is written only after the active player reaches the real `playing` state. Pause/resume events for the same loaded source do not repeatedly create play events. Reopening a source updates its existing history row and moves it to the newest position. Live YouTube broadcasts use the resolved video ID as their stable identity, so a new broadcast receives a new history identity while repeated opens of the same current broadcast remain deduplicated.

History retains at most **200** sources. Clearing history is intentionally isolated: favorites and custom playlists remain intact.

The `/playlists` route contains both Favorites and user-created playlists. A playlist can be created, renamed, deleted, populated from the active player, and reordered with explicit up/down controls. Saved History, Favorite, and Playlist sources are reopened through the existing unified player rather than a separate playback engine.

P3 does **not** synchronize library data to PostgreSQL or another server, and it does not implement accounts, cloud backup, or cross-device state. Watch-progress/resume timestamps are also intentionally deferred. If IndexedDB is blocked or unavailable, LiveTV keeps media playback functional and disables only local-library persistence features.

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
curl --fail 'http://localhost:8080/api/youtube/resolve-live?url=https%3A%2F%2Fwww.youtube.com%2F%40Halktvkanali'
docker compose down
```

## Dependency policy

Main project components must remain free and open source. Every direct external dependency is checked by `npm run licenses:check`; dependencies with missing or unapproved license metadata fail the command instead of being silently accepted.

GitHub pull requests also run Dependency Review, and Dependabot checks npm and GitHub Actions dependencies weekly.

## Repository license

The software license for LiveTV has **not yet been selected**. This repository being public does not by itself grant permission to copy, modify, or redistribute the source code. A project license will be chosen explicitly before a licensed release is published.

## Roadmap boundary

P3 does not implement torrent streaming, M3U channel-list parsing, downloads or recording, torrent archival behavior, seeding, authentication, server-side personal libraries, cloud synchronization, or watch-progress resume. It also does not attempt to bypass YouTube advertising for non-Premium users; Premium behavior is delegated to the signed-in YouTube session when that session is available to the embed.

The guest library is deliberately repository-backed so a later authenticated synchronization phase can consume the same application-level records without making the player depend on raw IndexedDB structure.
