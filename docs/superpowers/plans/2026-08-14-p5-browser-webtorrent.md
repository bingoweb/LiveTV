# P5 Browser WebTorrent Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add single-session browser WebTorrent streaming for magnet/local `.torrent`/HTTP(S) torrent inputs, file selection, status/cleanup, and stable P3 History/Favorites/Playlist replay while keeping the existing UnifiedPlayer as the only media playback surface.

**Architecture:** WebTorrent is lazy-loaded behind a dedicated controller. Its official worker bridge is served at `/webtorrent/sw.js` from the installed package and imported by LiveTV's existing root `/sw.js`; WebTorrent uses that single root registration because Service Worker scope controls client pages, not request URL ownership. TorrentController resolves the swarm/file and hands the selected file's same-origin `/webtorrent/<info-hash>/<file-path>` URL to the existing UnifiedPlayer; P3 persistence stores canonical magnet URI + file path instead of temporary stream URLs.

**Tech Stack:** React 19, TypeScript 6, Vite 8, native Service Worker/WebRTC APIs, WebTorrent `^3.0.11`, existing Plyr/direct-media adapter, existing IndexedDB P3 library, Vitest.

## Global Constraints

- Browser WebTorrent/WebRTC only; no `webtorrent-hybrid`, server torrent engine, TCP/UDP bridge, or backend torrent proxy.
- At most one active torrent session.
- Magnet, HTTP(S) `.torrent` URL, and local `.torrent` file are supported; local metadata max is 5 MiB.
- Use the official worker from the installed `webtorrent` package, not a CDN or silently stale copied vendor file.
- Root `/sw.js` stays the single PWA registration, imports the official WebTorrent bridge, and keeps its own shell-cache handler out of `/webtorrent/` stream requests.
- Torrent chunks are session-oriented; use `destroyStoreOnDestroy: true` and explicit `destroyStore: true` cleanup where supported.
- Do not expose torrent download/save, torrent creation, permanent archive, explicit seeding mode, recording, transcoding, DRM/geo bypass, auth, or cloud sync.
- P2 direct/HLS/YouTube, P3 History/Favorites/Playlists, and P4 IPTV behavior must remain regression-clean.
- WebTorrent must be dynamically imported so initial non-torrent startup is not forced to load the torrent runtime.
- Browser WebRTC peer limitations and active P2P upload behavior must be visible in the Torrent UI.

---

### Task 1: Add WebTorrent dependency and official worker-bridge build plumbing

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `apps/web/vite.config.ts`
- Create: `apps/web/vite.webtorrent-worker.ts`
- Create: `apps/web/src/torrent/webtorrent-worker.test.ts`
- Modify: `tests/pwa-assets.test.ts`

**Interfaces:**

```ts
export const WEBTORRENT_BRIDGE_URL = '/webtorrent/sw.js'
export const PWA_WORKER_URL = '/sw.js'
export const PWA_WORKER_SCOPE = '/'

export function resolveWebTorrentWorkerPath(): string
export function readWebTorrentWorkerSource(): string
export function webTorrentWorkerPlugin(): Plugin
```

- [x] **Step 1: Install WebTorrent as a direct web runtime dependency** with `npm install webtorrent@^3.0.11 -w @livetv/web`. Confirm package/lock changes only; do not add Node polyfill dependencies. Evidence: npm resolved WebTorrent `3.0.21`; no broad Node polyfill dependency was added.
- [x] **Step 2: Inspect the installed package** and verify the browser worker exists at the package's `dist/sw.min.js`; record its actual resolved path without copying it into source control. Evidence: installed package exposes `node_modules/webtorrent/dist/sw.min.js` and `dist/webtorrent.min.js`.
- [x] **Step 3: Write RED tests** for `resolveWebTorrentWorkerPath()` and `readWebTorrentWorkerSource()` proving the resolved source exists, is non-empty JavaScript, and contains WebTorrent worker behavior. Extend the PWA regression test to assert root `sw.js` still excludes video/audio/API/media traffic and does not cache `/webtorrent/` streams.
- [x] **Step 4: Run** `npx vitest run apps/web/src/torrent/webtorrent-worker.test.ts tests/pwa-assets.test.ts`; confirm RED because worker plumbing does not exist.
- [x] **Step 5: Implement `vite.webtorrent-worker.ts`** using Node filesystem/path APIs. Resolve the installed `webtorrent` package root from its runtime entry, read `dist/sw.min.js`, serve that source at `/webtorrent/sw.js` in Vite dev middleware, and emit `webtorrent/sw.js` during production build. Set JavaScript content type and `Cache-Control: no-cache` for dev worker responses.
- [x] **Step 6: Register `webTorrentWorkerPlugin()` in `vite.config.ts`** after React plugin. Root PWA registration/scope remains `/sw.js` + `/`; final browser acceptance later established that root `sw.js` must import the emitted official bridge rather than creating a second registration. `tsconfig.node.json` enables TypeScript-extension imports only for the no-emit Vite config graph so Vite's native config-loader compatibility warning is avoided.
- [x] **Step 7: Run focused tests, `npm run build -w @livetv/web`, and verify `apps/web/dist/webtorrent/sw.js` exists and is non-empty. Run `npm run licenses:check`; confirm WebTorrent is accepted under MIT. Evidence: 5/5 focused tests pass; production emits a 1.29 kB `dist/webtorrent/sw.js`; WebTorrent `3.0.21 — MIT`; license policy passes 20 direct dependencies. `npm audit` reports the known `webtorrent → torrent-discovery → bittorrent-tracker → ip` high-severity advisory chain with no viable modern fix (npm suggests a breaking downgrade to WebTorrent 0.7.3); P5 remains browser-only and adds no server-side arbitrary URL proxy/SSRF surface. This caveat will be carried into final documentation.
- [x] **Step 8: Commit** with `feat: add WebTorrent worker runtime plumbing`.

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

- [x] **Step 1: Write RED helper tests** proving magnet URI acceptance, HTTP(S) torrent URL acceptance, rejection of ordinary media/file/custom schemes, 5 MiB constant, media classification for documented video/audio extensions, unsupported fallback, preferred path selection, single-playable auto selection, and multi-playable no-auto-selection.
- [x] **Step 2: Add stable identity RED tests** proving source key is deterministic from lower-cased infoHash + encoded file path and canonical magnet URI is stored instead of `/webtorrent/...` stream URL.
- [x] **Step 3: Extend P3 repository RED tests** with torrent History/Favorite/Playlist records. Prove valid torrent records survive read guards while malformed torrent records missing file path/media type are skipped; existing source kinds remain valid.
- [x] **Step 4: Run focused tests** and confirm RED.
- [x] **Step 5: Implement torrent helper types/functions** with deterministic validation and file classification. Do not import WebTorrent runtime into these pure helpers.
- [x] **Step 6: Extend `LibrarySource` to include the torrent variant** and update P3 read guards/kind labels. Existing `toLibrarySource(PlayerSource)` remains for non-torrent sources; torrent sources are constructed only by `createTorrentLibrarySource()`. The legacy library-to-player mapper explicitly rejects torrent sources so they cannot accidentally be classified as ordinary direct video before replay coordination lands.
- [x] **Step 7: Run helper/P3 repository/UI tests plus web typecheck**; confirm PASS and no P3 regression. Evidence: 28/28 focused helper/repository/History/Playlist tests pass; web typecheck exits 0.
- [x] **Step 8: Commit** with `feat: add persistent torrent source identity`.

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
  onError(listener: (error: Error) => void): () => void
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

- [x] **Step 1: Write browser-runtime RED tests** with injected `navigator`/dynamic-import seams. Prove unsupported service-worker/WebRTC states fail locally, worker registration uses `/webtorrent/sw.js` + `/webtorrent/`, registration activation waits on the returned registration (not root `navigator.serviceWorker.ready`), client-level error listener is installed, and `createServer({ controller: registration })` is called once.
- [x] **Step 2: Implement `createBrowserWebTorrentRuntime()`**. Dynamically import WebTorrent only during initialization; use the package's browser-ready `dist/webtorrent.min.js` so broad Node polyfills are unnecessary. Wrap callback cleanup into `TorrentRuntime.remove()` with `destroyStore: true`; create torrents with `deselect: true` + `destroyStoreOnDestroy: true`. Final browser acceptance corrected the initial narrow-worker assumption: runtime now registers/reuses root `/sw.js` at `/`, whose imported official bridge yields `/webtorrent/<info-hash>/<file-path>` stream URLs.
- [x] **Step 3: Write TorrentController RED tests** with a fake `TorrentRuntime`. Cover initialize, magnet input, local file bytes, metadata-ready files, `noPeers` advisory state, fatal torrent error isolation, one-active-torrent replacement cleanup, stats refresh, preferred replay file, select file deselect/select behavior, direct-video/audio playback descriptor, stop/destroy cleanup, and best-effort `beforeunload` cleanup.
- [x] **Step 4: Run focused tests** and confirm RED where controller functionality is absent.
- [x] **Step 5: Implement TorrentController** with snapshot/subscription API, one active torrent, event listener registration/removal, 1-second stats timer, 5 MiB file guard, and best-effort beforeunload cleanup hook through an injectable environment seam.
- [x] **Step 6: Ensure `selectFile()` builds `TorrentLibrarySource` from runtime `infoHash + magnetURI + file.path` and returns WebTorrent `streamURL`; unsupported files reject without mutating active selection.
- [x] **Step 7: Run runtime/controller tests and web typecheck**; confirm PASS without network access. Evidence: 15/15 runtime/controller tests pass and web typecheck exits 0. Focused web build passes with the official bridge emitted separately; WebTorrent runtime remains dynamically split until the torrent feature is used.
- [x] **Step 8: Commit** with `feat: add Browser WebTorrent session controller`.

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

- [x] **Step 1: Write context RED tests** proving provider remains runtime-lazy, torrent unsupported/error snapshots stay isolated to the torrent feature, and SSR children still render before browser runtime initialization.
- [x] **Step 2: Write `TorrentWorkspaceView` RED tests** for idle controls, mandatory WebRTC/P2P/upload disclosure, initializing/metadata/no-peers/error states, stats labels, file rows, unsupported disabled Play, supported Play, and Stop action.
- [x] **Step 3: Add App route RED test** proving `/torrent` renders functional torrent workspace instead of the old "Arayüz hazır / Yakında" placeholder while the right-side UnifiedPlayer remains present.
- [x] **Step 4: Implement `TorrentProvider`** around one controller and wrap App alongside existing Library/IPTV providers. Browser WebTorrent initialization remains deferred until the first torrent operation, so normal LiveTV startup does not load the P2P runtime.
- [x] **Step 5: Implement TorrentWorkspace** text source form, local `.torrent` picker, session status/stats, file list, playback selection callback, and Stop/cleanup. Stable replay-request consumption is intentionally completed in Task 5 together with App/P3 replay coordination so there is only one replay pathway.
- [x] **Step 6: Route `/torrent` to TorrentWorkspace** and keep WebRTC-only peer compatibility, active P2P upload behavior, and no-permanent-archive behavior explicit in user copy.
- [x] **Step 7: Add existing-design CSS only**; no responsive redesign. Long paths/hash/stat rows are overflow-safe and controls retain existing touch/focus patterns.
- [x] **Step 8: Run context/workspace/App/responsive tests and web typecheck**; confirm PASS. Evidence: 11/11 focused provider/workspace/App/responsive tests pass and web typecheck exits 0. Production build emits WebTorrent as a separate dynamic `webtorrent.min` chunk plus the official bridge asset, while the initial app chunk remains separate.
- [x] **Step 9: Commit** with `feat: add functional WebTorrent workspace`. The intermediate commit was intentionally skipped because live acceptance exposed provider-lifetime, App handoff, and Service Worker architecture bugs; the corrected workspace is folded into the verified `chore: complete P5 Browser WebTorrent milestone` commit instead of preserving a known-broken intermediate state.

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

- [x] **Step 1: Write PlayerOpenRequest RED tests** proving torrent playback descriptor creates direct-video/audio request with `/webtorrent/...` stream URL but carries the stable torrent `librarySourceOverride`; normal P3/P4 requests remain unchanged. The common request also converts WebTorrent's path-only `file.streamURL` to an absolute same-origin HTTP URL before generic source classification.
- [x] **Step 2: Update UnifiedPlayer** so real `playing`, favorite, and playlist actions prefer `librarySourceOverride` when supplied. Clear override on manual/direct source loads and normal requests. The actual player source remains the temporary same-origin direct stream. A pure `resolvePlayerLibrarySource()` test proves the stable torrent override wins over the transient WebTorrent URL.
- [x] **Step 3: Write App replay RED tests/helper tests** proving normal History entries still create direct PlayerOpenRequests while `kind: 'torrent'` creates `TorrentReplayRequest`, routes through `/torrent`, and never attempts to load the magnet in PlayerController. `replayTorrentSource()` is deterministically tested to reopen the canonical magnet, wait for metadata, select the saved file path, and reject when that file no longer exists.
- [x] **Step 4: Implement torrent replay coordination**: History/Playlist/Favorite `onPlaySource` branches torrent sources to TorrentWorkspace; TorrentProvider exposes the tested replay helper; when TorrentWorkspace returns a playback descriptor it creates the normal player request and UnifiedPlayer loads it with the stable P3 override.
- [x] **Step 5: Update player-core magnet error** from future-P5 wording to current routing instruction. The error code is now `TORRENT_WORKSPACE_REQUIRED` and the message is `Magnet bağlantısını Torrent panelinden aç.`; generic classification still rejects magnet input.
- [x] **Step 6: Run player-core, player-request, replay, UnifiedPlayer library-source, App, P3 repository/history/favorite/playlist, TorrentWorkspace, worker, and web/core typecheck tests plus a production web build**; confirm PASS. Evidence: focused tests/typechecks/build exit 0 and the browser-safe worker constants were split out of the Node-only Vite plugin before runtime integration.
- [x] **Step 7: Commit** with `feat: integrate torrent playback with LiveTV library`. As with Task 4, the separate intermediate commit was skipped after live acceptance found integration defects; the corrected wiring is included in the verified P5 milestone commit.

---

### Task 6: P5 docs, real browser acceptance, verification, PR/merge

**Files:**

- Modify: `README.md`
- Modify: `apps/web/src/app-meta.ts`
- Modify: `apps/web/src/app-meta.test.ts`
- Modify: `apps/web/src/components/Navigation.tsx`
- Modify: `apps/web/src/components/SettingsShell.tsx`
- Modify: this plan for evidence/checkmarks.

- [x] **Step 1: Update current milestone copy** to `P5` / `Browser WebTorrent` without rewriting historical P2/P3/P4 architecture references.
- [x] **Step 2: Update README** with browser/WebRTC-only peer limitation, magnet/file/HTTP(S) torrent input, root-worker WebTorrent bridge, single-session cleanup, P2P upload disclosure, no server fallback/archive, media-file selection, same UnifiedPlayer handoff, stable P3 replay identity, and the tracked transitive audit caveat.
- [x] **Step 3: Run full local gate:** `npm run verify`, `git diff --check`, `docker compose config`, plus production-build assertion that `apps/web/dist/webtorrent/sw.js` exists. Evidence after all browser-discovered fixes: 41 test files / 164 tests pass; format, ESLint, all workspace typechecks/builds, 20 direct-dependency license checks, `git diff --check`, Compose config, and non-empty worker asset all pass. WebTorrent remains a separate dynamic chunk. The existing non-fatal HLS chunk-size warning remains.
- [x] **Step 4: Docker rebuild/health regression:** YouTube key was preserved without printing; web/api/media-worker/caddy rebuilt healthy; root/API/media endpoints passed and Halk TV resolved through official Data API.
- [x] **Step 5: Browser service-worker acceptance:** fresh isolated Chrome acceptance disproved the original two-worker design. Final architecture has exactly one activated root `/sw.js` registration; it imports `/webtorrent/sw.js`, and a Range-backed torrent stream at `/webtorrent/<info-hash>/<file-path>` reaches the controlled `/torrent` page without falling through to `index.html`.
- [x] **Step 6: Live WebTorrent acceptance:** official Sintel sample resolved metadata with WebRTC peers, exposed 11 files, selected `Sintel/Sintel.mp4`, sent the same-origin `/webtorrent/<hash>/Sintel/Sintel.mp4` URL to UnifiedPlayer, produced `readyState=4` / duration `888.064`, and reached real `Oynatılıyor` with advancing currentTime and no media error.
- [x] **Step 7: P3 browser integration:** after real playback, History showed `TORRENT · Sintel.mp4`, Favorite persisted, custom playlist `P5 Torrent Kabul` contained one `Sintel.mp4` item, History replay rebuilt the torrent route/session and returned to real playing, and Stop cleared torrent session counters/files to idle. Halk TV remained CANLI, ANKA ÇEVRİMDIŞI, IPTV empty-state route worked, and a separate torrent-free browser context finished with no console error/warn/issue.
- [x] **Step 8: Mark evidence and commit** with `chore: complete P5 Browser WebTorrent milestone`.
- [ ] **Step 9: Post-commit `npm test`, secret scan, worktree-clean proof**, then record evidence in a small docs commit.
- [ ] **Step 10: Push detached HEAD as `feat/p5-browser-webtorrent`, open PR to `main`, wait for `verify` + `dependency-review`, fix actionable failures, merge when green, fast-forward normal main while preserving ignored `.env`, close integration checkbox with final docs commit, push, run full `npm run verify` on final pushed main, and confirm final main push CI succeeds.

## Exit Criteria

- [x] Magnet, local `.torrent`, and HTTP(S) torrent inputs enter Browser WebTorrent without backend proxying.
- [x] Official WebTorrent worker bridge is served at `/webtorrent/sw.js`, imported by the single root `/sw.js` registration, while LiveTV shell caching bypasses `/webtorrent/` streams.
- [x] Browser WebRTC/service-worker unsupported cases fail only the torrent feature.
- [x] Torrent metadata, browser-playable file candidates, peer/progress/speed status, no-peers warnings, and Stop controls work.
- [x] Selected torrent media streams through existing UnifiedPlayer using `/webtorrent/...` URL.
- [x] Only one active torrent exists; opening another/Stop destroys previous store best-effort.
- [x] UI discloses WebRTC-only peer compatibility and active P2P upload behavior.
- [x] Torrent History/Favorites/Playlists persist stable magnet + file path identity and replay through TorrentWorkspace.
- [x] Generic PlayerController never tries to classify magnet as direct media.
- [x] No server torrent fallback, permanent archive/download UI, torrent creation, recording, or transcoding is added.
- [x] P2/P3/P4 regressions remain clean.
- [ ] Full verification, Docker/service-worker/browser acceptance, GitHub CI, merge, and final-main verification pass.
