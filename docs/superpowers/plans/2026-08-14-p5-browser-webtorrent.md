# P5 Browser WebTorrent Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-session browser WebTorrent streaming for magnet/local `.torrent`/HTTP(S) torrent inputs, file selection, status/cleanup, and stable P3 History/Favorites/Playlist replay while keeping the existing UnifiedPlayer as the only media playback surface.

**Architecture:** WebTorrent is lazy-loaded behind a dedicated controller. Its official service worker is served at `/webtorrent/sw.js` and registered only for `/webtorrent/`, leaving LiveTV's root PWA worker untouched. TorrentController resolves the swarm/file and hands the selected file's same-origin stream URL to the existing UnifiedPlayer; P3 persistence stores canonical magnet URI + file path instead of temporary stream URLs.

**Tech Stack:** React 19, TypeScript 6, Vite 8, native Service Worker/WebRTC APIs, WebTorrent `^3.0.11`, existing Plyr/direct-media adapter, existing IndexedDB P3 library, Vitest.

## Global Constraints

- Browser WebTorrent/WebRTC only; no `webtorrent-hybrid`, server torrent engine, TCP/UDP bridge, or backend torrent proxy.
- At most one active torrent session.
- Magnet, HTTP(S) `.torrent` URL, and local `.torrent` file are supported; local metadata max is 5 MiB.
- Use the official worker from the installed `webtorrent` package, not a CDN or silently stale copied vendor file.
- Root `/sw.js` stays responsible for PWA shell/static caching; WebTorrent worker scope is `/webtorrent/` only.
- Torrent chunks are session-oriented; use `destroyStoreOnDestroy: true` and explicit `destroyStore: true` cleanup where supported.
- Do not expose torrent download/save, torrent creation, permanent archive, explicit seeding mode, recording, transcoding, DRM/geo bypass, auth, or cloud sync.
- P2 direct/HLS/YouTube, P3 History/Favorites/Playlists, and P4 IPTV behavior must remain regression-clean.
- WebTorrent must be dynamically imported so initial non-torrent startup is not forced to load the torrent runtime.
- Browser WebRTC peer limitations and active P2P upload behavior must be visible in the Torrent UI.

---

### Task 1: Add WebTorrent dependency and dedicated worker build plumbing

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/vite.webtorrent-worker.ts`
- Create: `apps/web/src/torrent/webtorrent-worker.test.ts`
- Modify: `tests/pwa-assets.test.ts`

**Interfaces:**

```ts
export const WEBTORRENT_WORKER_URL = '/webtorrent/sw.js'
export const WEBTORRENT_WORKER_SCOPE = '/webtorrent/'

export function resolveWebTorrentWorkerPath(): string
export function readWebTorrentWorkerSource(): string
export function webTorrentWorkerPlugin(): Plugin
```

- [ ] **Step 1: Install WebTorrent as a direct web runtime dependency** with `npm install webtorrent@^3.0.11 -w @livetv/web`. Confirm package/lock changes only; do not add Node polyfill dependencies.
- [ ] **Step 2: Inspect the installed package** and verify the browser worker exists at the package's `dist/sw.min.js`; record its actual resolved path without copying it into source control.
- [ ] **Step 3: Write RED tests** for `resolveWebTorrentWorkerPath()` and `readWebTorrentWorkerSource()` proving the resolved source exists, is non-empty JavaScript, and contains WebTorrent worker behavior. Extend the PWA regression test to assert root `sw.js` still excludes video/audio/API/media traffic and does not cache `/webtorrent/` streams.
- [ ] **Step 4: Run** `npx vitest run apps/web/src/torrent/webtorrent-worker.test.ts tests/pwa-assets.test.ts`; confirm RED because worker plumbing does not exist.
- [ ] **Step 5: Implement `vite.webtorrent-worker.ts`** using Node filesystem/path APIs. Resolve the installed `webtorrent` package root from its runtime entry, read `dist/sw.min.js`, serve that source at `/webtorrent/sw.js` in Vite dev middleware, and emit `webtorrent/sw.js` during production build. Set JavaScript content type and `Cache-Control: no-cache` for dev worker responses.
- [ ] **Step 6: Register `webTorrentWorkerPlugin()` in `vite.config.ts`** after React plugin. Do not change root PWA worker registration or scope.
- [ ] **Step 7: Run focused tests, `npm run build -w @livetv/web`, and verify `apps/web/dist/webtorrent/sw.js` exists and is non-empty. Run `npm run licenses:check`; confirm WebTorrent is accepted under MIT.
- [ ] **Step 8: Commit** with `feat: add WebTorrent worker runtime plumbing`.

---

### Task 2: Pure torrent source/file/library identity helpers and P3 schema extension

**Files:**

- Create: `apps/web/src/torrent/torrent-types.ts`
- Create: `apps/web/src/torrent/torrent-source.ts`
- Create: `apps/web/src/torrent/torrent-source.test.ts`
- Modify: `apps/web/src/library/library-types.ts`
- Modify: `apps/web/src/library/source-key.ts`
- Modify: `apps/web/src/library/source-key.test.ts`
- Modify: `apps/web/src/library/library-repository.ts`
- Modify: `apps/web/src/library/library-repository.test.ts`
- Modify: `apps/web/src/components/HistoryLibrary.tsx`
- Modify: `apps/web/src/components/PlaylistsLibrary.tsx`

**Interfaces:**

```ts
export const TORRENT_FILE_MAX_BYTES = 5 * 1024 * 1024

export type TorrentMediaType = 'video' | 'audio' | 'unsupported'

export type TorrentFileDescriptor = {
  path: string
  name: string
  size: number
  type: string
  mediaType: TorrentMediaType
  progress: number
  streamUrl?: string
}

export type TorrentLibrarySource = {
  sourceKey: string
  kind: 'torrent'
  url: string
  title: string
  torrentFilePath: string
  torrentMediaType: 'video' | 'audio'
  thumbnailUrl?: string
}

export function validateTorrentTextSource(input: string): string
export function classifyTorrentMediaFile(input: {
  name: string
  type?: string
}): TorrentMediaType
export function torrentSourceKey(infoHash: string, filePath: string): string
export function createTorrentLibrarySource(input: {
  infoHash: string
  magnetUri: string
  filePath: string
  fileName: string
  mediaType: 'video' | 'audio'
}): TorrentLibrarySource
export function choosePreferredTorrentFile(
  files: readonly TorrentFileDescriptor[],
  preferredPath?: string,
): TorrentFileDescriptor | null
```

- [ ] **Step 1: Write RED helper tests** proving magnet URI acceptance, HTTP(S) torrent URL acceptance, rejection of ordinary media/file/custom schemes, 5 MiB constant, media classification for documented video/audio extensions, unsupported fallback, preferred path selection, single-playable auto selection, and multi-playable no-auto-selection.
- [ ] **Step 2: Add stable identity RED tests** proving source key is deterministic from lower-cased infoHash + encoded file path and canonical magnet URI is stored instead of `/webtorrent/...` stream URL.
- [ ] **Step 3: Extend P3 repository RED tests** with torrent History/Favorite/Playlist records. Prove valid torrent records survive read guards while malformed torrent records missing file path/media type are skipped; existing source kinds remain valid.
- [ ] **Step 4: Run focused tests** and confirm RED.
- [ ] **Step 5: Implement torrent helper types/functions** with deterministic validation and file classification. Do not import WebTorrent runtime into these pure helpers.
- [ ] **Step 6: Extend `LibrarySource` to include the torrent variant** and update P3 read guards/kind labels. Existing `toLibrarySource(PlayerSource)` remains for non-torrent sources; torrent sources are constructed only by `createTorrentLibrarySource()`.
- [ ] **Step 7: Run helper/P3 repository/UI tests plus web typecheck**; confirm PASS and no P3 regression.
- [ ] **Step 8: Commit** with `feat: add persistent torrent source identity`.

---

### Task 3: Browser WebTorrent runtime adapter and deterministic TorrentController

**Files:**

- Create: `apps/web/src/torrent/webtorrent-runtime.ts`
- Create: `apps/web/src/torrent/webtorrent-runtime.test.ts`
- Create: `apps/web/src/torrent/torrent-controller.ts`
- Create: `apps/web/src/torrent/torrent-controller.test.ts`

**Interfaces:**

Keep WebTorrent's broad dynamic runtime behind narrow local interfaces so controller tests never require live peers:

```ts
export type TorrentRuntimeFile = {
  name: string
  path: string
  length: number
  type: string
  progress: number
  streamURL: string
  select(): void
  deselect(): void
}

export type TorrentRuntimeTorrent = {
  infoHash: string
  magnetURI: string
  name: string
  files: TorrentRuntimeFile[]
  numPeers: number
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  downloaded: number
  uploaded: number
  timeRemaining: number
  on(event: string, listener: (...args: unknown[]) => void): void
  off(event: string, listener: (...args: unknown[]) => void): void
}

export type TorrentRuntime = {
  supported: boolean
  add(source: string | Uint8Array): TorrentRuntimeTorrent
  remove(torrent: TorrentRuntimeTorrent): Promise<void>
  destroy(): Promise<void>
}

export type TorrentSnapshot = {
  status: 'idle' | 'initializing' | 'metadata' | 'ready' | 'streaming' | 'error'
  supported: boolean | null
  torrentName?: string
  infoHash?: string
  magnetUri?: string
  files: readonly TorrentFileDescriptor[]
  selectedFilePath?: string
  numPeers: number
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  downloaded: number
  uploaded: number
  timeRemaining: number
  noPeers: boolean
  warningMessage?: string
  errorMessage?: string
}

export type TorrentPlaybackDescriptor = {
  streamUrl: string
  preference: 'direct-video' | 'direct-audio'
  title: string
  librarySource: TorrentLibrarySource
}
```

- [ ] **Step 1: Write browser-runtime RED tests** with injected `navigator`/dynamic-import seams. Prove unsupported service-worker/WebRTC states fail locally, worker registration uses `/webtorrent/sw.js` + `/webtorrent/`, registration activation waits on the returned registration (not root `navigator.serviceWorker.ready`), client-level error listener is installed, and `createServer({ controller: registration })` is called once.
- [ ] **Step 2: Implement `createBrowserWebTorrentRuntime()`**. Dynamically import WebTorrent only during initialization; prefer its browser distribution if Vite's normal import requires Node polyfills. Wrap callback/promise cleanup into `TorrentRuntime.remove()` with `destroyStore: true`; create torrents with `deselect: true` + `destroyStoreOnDestroy: true`.
- [ ] **Step 3: Write TorrentController RED tests** with a fake `TorrentRuntime`. Cover initialize, magnet input, local file bytes, metadata-ready files, `noPeers` advisory state, fatal torrent error isolation, one-active-torrent replacement cleanup, stats refresh, preferred replay file, select file deselect/select behavior, direct-video/audio playback descriptor, and stop/destroy cleanup.
- [ ] **Step 4: Run focused tests** and confirm RED where controller functionality is absent.
- [ ] **Step 5: Implement TorrentController** with snapshot/subscription API, one active torrent, event listener registration/removal, 1-second stats timer, 5 MiB file guard, and best-effort beforeunload cleanup hook through an injectable environment seam.
- [ ] **Step 6: Ensure `selectFile()` builds `TorrentLibrarySource` from runtime `infoHash + magnetURI + file.path` and returns WebTorrent `streamURL`; unsupported files reject without mutating active selection.
- [ ] **Step 7: Run runtime/controller tests and web typecheck**; confirm PASS without network access.
- [ ] **Step 8: Commit** with `feat: add Browser WebTorrent session controller`.

---

### Task 4: React Torrent provider and functional `/torrent` workspace

**Files:**

- Create: `apps/web/src/torrent/torrent-context.tsx`
- Create: `apps/web/src/torrent/torrent-context.test.tsx`
- Create: `apps/web/src/components/TorrentWorkspace.tsx`
- Create: `apps/web/src/components/TorrentWorkspace.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/RouteContent.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**

```ts
export type TorrentContextValue = TorrentSnapshot & {
  openTextSource(input: string, preferredFilePath?: string): Promise<void>
  openTorrentFile(file: File, preferredFilePath?: string): Promise<void>
  selectFile(path: string): Promise<TorrentPlaybackDescriptor>
  stop(): Promise<void>
}
```

`TorrentWorkspace` receives:

```ts
onPlayDescriptor(descriptor: TorrentPlaybackDescriptor): void
replayRequest?: { id: number; magnetUri: string; filePath: string } | null
```

- [ ] **Step 1: Write context RED tests** proving provider initializes lazily, controller failure becomes torrent-only error/capability state, and SSR children still render before browser runtime initialization.
- [ ] **Step 2: Write `TorrentWorkspaceView` RED tests** for idle controls, mandatory WebRTC/P2P/upload disclosure, initializing/metadata/no-peers/error states, stats labels, file rows, unsupported disabled Play, supported Play, and Stop action.
- [ ] **Step 3: Add App route RED test** proving `/torrent` renders functional torrent workspace instead of the old "Arayüz hazır / Yakında" placeholder while the right-side UnifiedPlayer remains present.
- [ ] **Step 4: Implement `TorrentProvider`** around one controller and wrap App alongside existing Library/IPTV providers. Initialization may be triggered on first torrent operation instead of application startup so WebTorrent stays lazy.
- [ ] **Step 5: Implement TorrentWorkspace** text source form, local `.torrent` picker, session status/stats, file list, playback selection, Stop/cleanup, and replay-request consumption once per request ID.
- [ ] **Step 6: Route `/torrent` to TorrentWorkspace** and keep all P2P capability limitations explicit in user copy.
- [ ] **Step 7: Add existing-design CSS only**; no responsive redesign. Keep long paths/hash/stat rows overflow-safe and touch controls accessible.
- [ ] **Step 8: Run context/workspace/App/responsive tests and web typecheck**; confirm PASS.
- [ ] **Step 9: Commit** with `feat: add functional WebTorrent workspace`.

---

### Task 5: UnifiedPlayer handoff and torrent P3 replay/favorite/history integration

**Files:**

- Modify: `apps/web/src/player/player-open-request.ts`
- Modify: `apps/web/src/player/player-open-request.test.ts`
- Modify: `apps/web/src/components/UnifiedPlayer.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/RouteContent.tsx`
- Modify: `apps/web/src/library/library-player-request.ts`
- Modify: `apps/web/src/library/library-player-request.test.ts`
- Modify: `apps/web/src/library/playback-history-session.test.ts`
- Modify: `packages/player-core/src/source.ts`
- Modify: `packages/player-core/test/source.test.ts`

**Interfaces:**

Extend common request metadata only inside web app:

```ts
export type PlayerOpenRequest = {
  id: number
  url: string
  preference: PlayerSourcePreference
  title?: string
  thumbnailUrl?: string
  channelUrl?: string
  librarySourceOverride?: LibrarySource
}

export type TorrentReplayRequest = {
  id: number
  magnetUri: string
  filePath: string
}
```

- [ ] **Step 1: Write PlayerOpenRequest RED tests** proving torrent playback descriptor creates direct-video/audio request with `/webtorrent/...` stream URL but carries the stable torrent `librarySourceOverride`; normal P3/P4 requests remain unchanged.
- [ ] **Step 2: Update UnifiedPlayer** so real `playing`, favorite, and playlist actions prefer `librarySourceOverride` when supplied. Clear override on manual/direct source loads and normal requests. The actual player source remains the temporary same-origin direct stream.
- [ ] **Step 3: Write App replay RED tests/helper tests** proving normal History entries still create direct PlayerOpenRequests while `kind: 'torrent'` creates `TorrentReplayRequest`, navigates to `/torrent`, and never attempts to load the magnet in PlayerController.
- [ ] **Step 4: Implement torrent replay coordination**: History/Playlist/Favorite `onPlaySource` branches torrent sources to TorrentWorkspace; when that workspace returns a playback descriptor it creates the normal player request and UnifiedPlayer loads it.
- [ ] **Step 5: Update player-core magnet error** from future-P5 wording to current routing instruction. Keep magnet rejected by generic classification; dedicated Torrent workspace remains responsible for metadata/file selection.
- [ ] **Step 6: Run player-core, player-request, App, P3 repository/history/favorite/playlist, TorrentWorkspace, and web typecheck tests**; confirm PASS.
- [ ] **Step 7: Commit** with `feat: integrate torrent playback with LiveTV library`.

---

### Task 6: P5 docs, real browser acceptance, verification, PR/merge

**Files:**

- Modify: `README.md`
- Modify: `apps/web/src/app-meta.ts`
- Modify: `apps/web/src/app-meta.test.ts`
- Modify: `apps/web/src/components/Navigation.tsx`
- Modify: `apps/web/src/components/SettingsShell.tsx`
- Modify: this plan for evidence/checkmarks.

- [ ] **Step 1: Update current milestone copy** to `P5` / `Browser WebTorrent` without rewriting historical P2/P3/P4 architecture references.
- [ ] **Step 2: Update README** with browser/WebRTC-only peer limitation, magnet/file/HTTP(S) torrent input, dedicated `/webtorrent/` worker, single-session cleanup, P2P upload disclosure, no server fallback/archive, media-file selection, same UnifiedPlayer handoff, and stable P3 replay identity.
- [ ] **Step 3: Run full local gate:** `npm run verify`, `git diff --check`, `docker compose config`, plus production-build assertion that `apps/web/dist/webtorrent/sw.js` exists. Existing non-fatal large-chunk warnings may remain but WebTorrent must be split from initial app startup.
- [ ] **Step 4: Docker rebuild/health regression:** preserve YouTube key without printing, rebuild web/api/media-worker/caddy, verify root/API/media health and Halk TV Data API resolution.
- [ ] **Step 5: Browser service-worker acceptance:** in a fresh isolated Chrome context, verify both root LiveTV PWA registration and dedicated `/webtorrent/` registration coexist with correct scopes; verify ordinary app routes remain controlled by root worker and `/webtorrent/...` requests can use the narrow worker.
- [ ] **Step 6: Live WebTorrent acceptance:** use the WebTorrent project's documented Creative Commons Sintel magnet when public swarm/web seed availability permits. Verify metadata/file list, select an MP4 candidate, same UnifiedPlayer receives `/webtorrent/...` URL, and playback reaches ready/playing. Record peer/web-seed external limitations if unavailable; deterministic tests remain mandatory regardless.
- [ ] **Step 7: P3 browser integration:** while/after torrent playback, verify History/Favorite/custom Playlist stores `kind: torrent` stable magnet + file path identity, replay routes through `/torrent`, and Stop clears the active torrent session/store best-effort. Verify YouTube/IPTV routes and clean application console afterward.
- [ ] **Step 8: Mark evidence and commit** with `chore: complete P5 Browser WebTorrent milestone`.
- [ ] **Step 9: Post-commit `npm test`, secret scan, worktree-clean proof**, then record evidence in a small docs commit.
- [ ] **Step 10: Push detached HEAD as `feat/p5-browser-webtorrent`, open PR to `main`, wait for `verify` + `dependency-review`, fix actionable failures, merge when green, fast-forward normal main while preserving ignored `.env`, close integration checkbox with final docs commit, push, run full `npm run verify` on final pushed main, and confirm final main push CI succeeds.

## Exit Criteria

- [ ] Magnet, local `.torrent`, and HTTP(S) torrent inputs enter Browser WebTorrent without backend proxying.
- [ ] Official WebTorrent worker is served at `/webtorrent/sw.js` under `/webtorrent/` scope while root PWA worker remains intact.
- [ ] Browser WebRTC/service-worker unsupported cases fail only the torrent feature.
- [ ] Torrent metadata, browser-playable file candidates, peer/progress/speed status, no-peers warnings, and Stop controls work.
- [ ] Selected torrent media streams through existing UnifiedPlayer using `/webtorrent/...` URL.
- [ ] Only one active torrent exists; opening another/Stop destroys previous store best-effort.
- [ ] UI discloses WebRTC-only peer compatibility and active P2P upload behavior.
- [ ] Torrent History/Favorites/Playlists persist stable magnet + file path identity and replay through TorrentWorkspace.
- [ ] Generic PlayerController never tries to classify magnet as direct media.
- [ ] No server torrent fallback, permanent archive/download UI, torrent creation, recording, or transcoding is added.
- [ ] P2/P3/P4 regressions remain clean.
- [ ] Full verification, Docker/service-worker/browser acceptance, GitHub CI, merge, and final-main verification pass.
