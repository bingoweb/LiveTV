# LiveTV

LiveTV is a browser-first media player project designed as a single interface for live TV, YouTube, IPTV, playlists, guide data, and torrent streaming sources. The application targets desktop, tablet, and phone browsers and keeps heavy media work outside the UI layer.

## Current status

The repository is in **P6 — XMLTV TV Guide**. The responsive PWA shell, P2 unified playback engine, P3 guest library, P4 IPTV/M3U library, and P5 Browser WebTorrent workspace are now joined by a persistent XMLTV guide that still sends live channel playback through the same UnifiedPlayer.

The current implementation includes:

- desktop sidebar navigation and large player workspace,
- tablet split layout with a compact navigation rail,
- phone-first player layout with bottom navigation and a secondary bottom sheet,
- route shells for Home, Live TV, YouTube, Torrent, and Settings plus functional IPTV, TV Guide, Playlists, and History workspaces,
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
- extended-M3U parsing for channel name, `tvg-id`, `tvg-name`, `tvg-logo`, `group-title`, `#EXTGRP`, and playlist-level EPG URL metadata,
- IPTV list import from HTTP(S) URL, local `.m3u`/`.m3u8` file, or pasted M3U text,
- a dedicated `livetv-iptv` IndexedDB database for multiple persistent IPTV lists and their channels,
- channel search, group filtering, and incremental 200-row rendering for large lists,
- explicit refresh for URL-backed IPTV lists with transactional replacement, so a failed refresh preserves the last valid stored list,
- IPTV channel playback through the same unified player used by direct media, HLS, YouTube, History, and Playlists,
- IPTV channel title/logo metadata flowing into the existing P3 history/favorites behavior after real playback begins,
- non-fatal M3U parse warnings surfaced without rejecting otherwise valid playlists.
- browser-native WebTorrent input from magnet URIs, local `.torrent` metadata files, and HTTP(S) `.torrent` URLs,
- the official `/webtorrent/sw.js` WebTorrent stream bridge imported by LiveTV's existing root `/sw.js` worker, so one root registration owns both PWA shell behavior and torrent range streaming,
- one active torrent session with metadata/file browsing, peer/progress/download/upload statistics, WebRTC no-peer guidance, and explicit Stop/cleanup,
- lazy loading of the WebTorrent browser runtime so normal LiveTV startup does not load the large P2P client chunk,
- torrent media selection streamed through the existing UnifiedPlayer using same-origin `/webtorrent/<info-hash>/<file-path>` transport URLs,
- stable torrent History/Favorites/Playlist identity based on canonical magnet URI + torrent file path rather than the temporary stream URL,
- torrent History/Playlist replay routed back through the Torrent workspace so the swarm/file session is rebuilt before UnifiedPlayer playback,
- shared XMLTV parsing for channels, programme metadata, XMLTV timestamps, stop-time inference, and non-fatal malformed-row warnings,
- a dedicated `livetv-epg` IndexedDB cache with transactional replacement, 6-hour freshness, 12-hour past retention, and 8-day future retention,
- direct-first XMLTV fetch with local `.xml`/`.xmltv`/gzip import and a verified URL-backed API fallback when browser CORS blocks the feed,
- conservative IPTV-to-XMLTV channel matching using exact `tvg-id`, unique folded id, and ambiguity-safe display-name fallback,
- a functional `/guide` workspace with now/next status, today plus six following days, programme details, unmatched `EPG yok` channels, and existing-player channel actions.

Authentication, watch-progress resume, recording/catch-up, reminders, and cross-device sync remain later roadmap phases.

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

P6 XMLTV fallback rejects private/non-public network targets by default. An administrator who intentionally runs an IPTV/EPG provider on a LAN can opt in exact hosts through the server-only setting:

```text
EPG_FETCH_ALLOWED_PRIVATE_HOSTS=iptv.home.arpa,192.168.1.50
```

The value is passed only to the Fastify API service. It is an exact-host allowlist, not a CIDR or wildcard switch: redirects are independently revalidated, and playlist-declaration verification, protocol restrictions, timeouts, and body-size limits still apply.

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

## IPTV / M3U library

P4 stores IPTV list metadata and channels in a separate browser IndexedDB database named `livetv-iptv`. Keeping it separate from `livetv-library` lets the IPTV schema evolve without coupling channel-list storage to personal History, Favorites, and Playlist records.

The `/iptv` workspace accepts playlists in three ways:

- an HTTP(S) M3U URL,
- a local `.m3u` or `.m3u8` file,
- pasted M3U text.

Each import is limited to **10 MiB**. The parser understands common extended-M3U metadata including `tvg-id`, `tvg-name`, `tvg-logo`, `group-title`, and `#EXTGRP`. Playlist header EPG references from `url-tvg`, `x-tvg-url`, and `tvg-url` are preserved for P6 TV Guide matching and refresh.

Only HTTP(S) channel URLs are stored. Query strings and URL fragments are preserved because signed IPTV stream URLs may depend on them. Relative stream URLs can be resolved when the playlist itself was imported from a URL; file and paste imports reject relative stream URLs because they do not have a trustworthy base address. Malformed entries are skipped as non-fatal warnings when the same playlist still contains valid channels.

URL imports are fetched directly by the browser. LiveTV deliberately does **not** expose a generic unauthenticated backend URL-fetch proxy to bypass CORS. If an upstream playlist blocks browser cross-origin access, file or paste import remains available.

Multiple IPTV lists can be stored independently. The active list can be searched by channel name, `tvg-name`, `tvg-id`, group, or stream host, filtered by group, and displayed incrementally in batches of 200 channels. URL-backed lists expose an explicit **Listeyi yenile** action. Refresh parses a complete replacement first and writes it transactionally; a fetch/parse/write failure leaves the previous valid list and channel rows intact.

Choosing **Oynat** on an IPTV channel sends the channel into the existing UnifiedPlayer. `.m3u8` paths explicitly select the HLS engine; other HTTP(S) channel URLs use normal automatic source classification. Once that source reaches real `playing`, the existing P3 library integration can record it in History and preserve its IPTV display name/logo for Favorites and user playlists.

If `livetv-iptv` cannot be opened, the saved IPTV library is disabled but manual direct-media playback remains available.

## XMLTV TV Guide

P6 turns `/guide` into a functional, cache-first XMLTV programme guide. P4 remains the source of truth for IPTV lists and channels; P6 consumes the active list's preserved EPG URLs and `tvg-id` metadata without copying the IPTV library into a server account.

Guide data is normalized into a separate browser IndexedDB database named `livetv-epg`. The cache is disposable and rebuildable: a successful refresh replaces one list's EPG rows transactionally, while a fetch, parse, or write failure leaves the previous valid schedule intact. Programmes older than **12 hours** or more than **8 days** ahead are discarded during replacement. Cached URL-backed EPG is considered fresh for **6 hours**.

### Direct-first XMLTV loading

For every EPG URL declared by the selected IPTV list, LiveTV first tries a normal browser fetch. If that succeeds, XMLTV is parsed locally and no API fallback is used. Plain XML and gzip-compressed XMLTV are supported up to **50 MiB decompressed**.

If direct fetch fails because of CORS/network restrictions and the IPTV list itself came from an HTTP(S) M3U URL, the web app may call:

```text
POST /api/epg/fetch
```

The endpoint is intentionally **not** a generic URL proxy. Before it fetches the XMLTV URL, the API independently fetches the supplied playlist URL, extracts only `url-tvg`, `x-tvg-url`, and `tvg-url` from the M3U header, resolves relative declarations, and requires the requested EPG address to be one of those declared values. The playlist verification body is capped at **10 MiB / 12 seconds**; XMLTV is capped at **50 MiB decompressed / 20 seconds**.

Outbound API fetches permit only HTTP(S), validate DNS answers and every redirect target, reject private/loopback/link-local/non-public addresses by default, pin the actual socket to the already-validated DNS result, limit redirects, and do not forward browser cookies or arbitrary client headers. `EPG_FETCH_ALLOWED_PRIVATE_HOSTS` can opt in exact administrator-controlled LAN hosts without disabling the remaining checks.

File- or paste-imported IPTV lists never gain this server fallback because the API cannot independently prove where their EPG URL came from. They may still use a direct CORS-capable XMLTV URL, or the user can import a local `.xml`, `.xmltv`, `.xml.gz`, `.xmltv.gz`, or `.gz` file. Local-file mode remains local until the user explicitly chooses **URL’lerden yenile**; a background freshness check does not silently replace it.

### Channel matching and guide rows

P6 prefers correctness over aggressive fuzzy matching. An exact IPTV `tvg-id` match wins. A case-folded id is accepted only when unambiguous, followed by a conservative unique `tvg-name` / channel-name match against XMLTV `display-name`. Normalization preserves meaningful tokens such as `HD`, `4K`, numbers, and regional words. If a mapping is ambiguous, the channel stays visible as **EPG yok** rather than receiving a plausible-but-wrong schedule.

The Guide workspace shows **Şimdi**, **Sıradaki**, current-programme progress, today plus the next six calendar days, and expandable programme title/subtitle/description/category details. Selecting **Kanalı oynat** sends the original P4 `IptvChannel` through the existing `playerRequestForIptvChannel()` path; XMLTV programme selection does not imply catch-up playback or create another player.

When several EPG URLs are declared, source order is persisted and earlier sources win duplicate schedules. If only some sources fail, successful sources remain usable with a warning. If every refresh path fails, LiveTV keeps rendering the last valid cache and marks it stale rather than erasing the guide.

## Browser WebTorrent streaming

P5 turns `/torrent` into a functional Browser WebTorrent workspace. It accepts:

- a magnet URI containing a BitTorrent info hash,
- a local `.torrent` metadata file up to **5 MiB**,
- an HTTP(S) URL whose path points to a `.torrent` file.

The torrent runtime is loaded only after the user starts a torrent operation. LiveTV uses WebTorrent's browser distribution and does not add a Node polyfill stack to the normal web application bundle.

### WebRTC peer boundary

Browser WebTorrent communicates through WebRTC. Ordinary BitTorrent peers that expose only TCP/uTP/UDP transports may therefore be invisible to the browser. A torrent works best when the swarm contains WebRTC-capable peers and/or browser-accessible web seeds. LiveTV does **not** hide this limitation behind a server torrent engine, `webtorrent-hybrid`, TCP/UDP bridge, or generic backend proxy.

While a torrent is active, normal peer-to-peer protocol behavior may upload pieces to other compatible peers. P5 exposes upload statistics and states this behavior in the Torrent workspace. It does not provide a permanent seeding mode, torrent creation, download/archive UI, recording, or transcoding.

### WebTorrent bridge inside the root PWA worker

LiveTV keeps one root PWA registration at `/sw.js`. P5 still serves the official worker bundled with the installed `webtorrent` package at:

```text
/webtorrent/sw.js
```

but does **not** register it as a second scoped worker. Instead root `/sw.js` loads that official bridge with `importScripts('/webtorrent/sw.js')`. WebTorrent then uses the existing root registration with scope:

```text
/
```

This is required because a Service Worker controls client pages by registration scope; a second worker scoped only to `/webtorrent/` cannot intercept media requests initiated by LiveTV's `/torrent` page. With the root registration as WebTorrent's BrowserServer controller, selected files are exposed under same-origin paths shaped like:

```text
/webtorrent/<info-hash>/<file-path>
```

The root LiveTV cache listener explicitly bypasses `/webtorrent/*`, while the imported official WebTorrent fetch listener handles those requests and their Range responses. Torrent stream URLs are never added to the PWA shell cache.

### Single-session cleanup

LiveTV keeps at most one active torrent session. Opening another source first removes the previous torrent. Torrent adds use deselected files and `destroyStoreOnDestroy`; explicit Stop/cleanup requests store destruction as well. LiveTV does not intentionally retain a permanent torrent archive after Stop, although browser storage erasure is best-effort rather than a cryptographic wipe guarantee.

### File selection and UnifiedPlayer

After metadata arrives, the Torrent workspace lists all files. Browser media candidates such as MP4/WebM/MKV video or MP3/M4A/FLAC audio expose an **Oynat** action; unsupported files remain visible but disabled because container/codec support ultimately depends on the browser.

Selecting a media file does not create another player. TorrentController obtains the WebTorrent `streamURL`, converts it to an absolute same-origin URL, and sends it to the existing UnifiedPlayer as direct video or direct audio. Plyr and the existing player lifecycle remain the only media playback surface.

### History, Favorites, and Playlist replay

The temporary `/webtorrent/...` URL is not persisted as personal-library identity. Instead P3 stores a torrent source using:

- canonical magnet URI,
- torrent info hash,
- selected file path,
- selected file media type.

History/Favorites/Playlist identity is derived from `infoHash + filePath`. Replaying a saved torrent source navigates back to `/torrent`, rebuilds the WebTorrent session from the magnet, waits for metadata, selects the saved file path, and only then hands the new stream URL back to UnifiedPlayer. The generic PlayerController still rejects magnet URIs directly and tells the user to open them through the Torrent workspace.

### Dependency audit note

WebTorrent `3.0.21` is MIT licensed and passes the repository's direct dependency license policy. The current npm dependency graph reports the known high-severity `GHSA-2p57-rm9w-gvfp` advisory through `webtorrent → torrent-discovery → bittorrent-tracker → ip`. npm does not currently offer a viable modern in-range fix and suggests a breaking downgrade to a very old WebTorrent release. LiveTV does not apply `npm audit fix --force`; WebTorrent itself remains browser-only. P6's separate EPG endpoint is not an arbitrary proxy and applies playlist-declaration verification plus explicit outbound-network controls. GitHub Dependency Review therefore allowlists **only this advisory ID** while retaining its normal blocking policy for every other new vulnerability; the exception should be removed as soon as upstream WebTorrent resolves the dependency. This transitive advisory remains a tracked dependency caveat rather than being hidden by a breaking downgrade.

## PWA behavior

The normal PWA development entry point is `http://localhost:8080`. Localhost is treated as a secure context by modern browsers, so the service worker can register during local development.

The PWA boundary is deliberately strict:

- `manifest.webmanifest` declares standalone display mode and the application icons.
- `sw.js` caches the application shell and safe same-origin static assets only.
- `sw.js` imports the official WebTorrent stream bridge but its own cache handler still bypasses `/webtorrent/*` media requests.
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

P6 does not implement server-side/hybrid torrent fallback, normal TCP/UDP peer bridging, permanent torrent downloads/archive, torrent creation, explicit seeding management, recording/DVR, catch-up playback, programme reminders, transcoding, authentication, server-side personal libraries, cloud synchronization, or watch-progress resume. The EPG fallback is deliberately narrower than a general CORS-bypass URL proxy, and LiveTV does not attempt to bypass YouTube advertising for non-Premium users; Premium behavior is delegated to the signed-in YouTube session when that session is available to the embed.

The guest library is deliberately repository-backed so a later authenticated synchronization phase can consume the same application-level records without making the player depend on raw IndexedDB structure.
