# P4 IPTV / M3U Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent browser-first IPTV/M3U channel library that imports lists by URL/file/paste, supports search/group browsing and URL refresh, and plays selected channels through the existing UnifiedPlayer.

**Architecture:** Keep M3U parsing pure and deterministic under `apps/web/src/iptv/`, isolate IPTV persistence in its own `livetv-iptv` IndexedDB database, and expose it to React through an IPTV-specific controller/provider. Generalize the existing app-level player open request so P3 saved media and P4 IPTV channels both feed the same UnifiedPlayer without adding a new playback engine.

**Tech Stack:** React 19, TypeScript 6, native IndexedDB, native Fetch/File APIs, existing Vitest/fake-indexeddb test setup, existing UnifiedPlayer/Plyr/HLS.js stack.

## Global Constraints

- No new runtime dependency is required for P4.
- URL import is browser-side; do not add an unauthenticated arbitrary-URL backend proxy.
- Only HTTP(S) channel URLs are accepted.
- Preserve query strings and fragments in stream URLs.
- URL imports may resolve relative channel URLs against the playlist URL; file/paste imports reject relative channel URLs.
- Maximum imported text size is 10 MiB.
- XMLTV/EPG documents are not fetched or rendered in P4; only M3U EPG metadata is preserved.
- No auth, cloud sync, recording, downloading, torrent streaming, DRM bypass, or geo-restriction bypass.
- Existing P2/P3 playback/history/favorites/playlists behavior must remain compatible.
- Responsive redesign remains outside this milestone; functional UI integration uses the existing shell.

---

### Task 1: Pure extended-M3U parser and channel filtering helpers

**Files:**

- Create: `apps/web/src/iptv/m3u-types.ts`
- Create: `apps/web/src/iptv/m3u-parser.ts`
- Create: `apps/web/src/iptv/m3u-parser.test.ts`
- Create: `apps/web/src/iptv/channel-filter.ts`
- Create: `apps/web/src/iptv/channel-filter.test.ts`

**Interfaces:**

```ts
export type M3uParseWarning = {
  line: number
  code:
    | 'missing-stream-url'
    | 'unsupported-protocol'
    | 'relative-url-without-base'
    | 'invalid-url'
  message: string
}

export type ParsedIptvChannel = {
  name: string
  streamUrl: string
  tvgId?: string
  tvgName?: string
  logoUrl?: string
  groupTitle?: string
}

export type ParsedM3uPlaylist = {
  channels: ParsedIptvChannel[]
  epgUrls: string[]
  warnings: M3uParseWarning[]
}

export function parseM3u(
  text: string,
  options?: { baseUrl?: string },
): ParsedM3uPlaylist

export function filterIptvChannels<T extends ParsedIptvChannel>(
  channels: readonly T[],
  options: { query: string; group: string | null },
): T[]

export function listIptvGroups(
  channels: readonly ParsedIptvChannel[],
): string[]
```

- [x] **Step 1: Write parser RED tests** covering quoted/unquoted `#EXTINF` attributes, comma-containing display names, `#EXTGRP` fallback, header EPG extraction, signed query/fragment preservation, URL-relative resolution, file/paste-relative rejection, malformed-row warnings, and duplicate elimination.

Example fixture:

```ts
const text = `#EXTM3U url-tvg="https://epg.example/guide.xml"
#EXTINF:-1 tvg-id="news.tr" tvg-name="Haber 1" tvg-logo="https://img.example/logo.png" group-title="Haber",Haber, Canlı
https://cdn.example/live/index.m3u8?token=abc#edge
#EXTINF:-1 group-title="Belgesel",Belgesel
../relative/stream.m3u8`

expect(parseM3u(text, { baseUrl: 'https://lists.example/main/list.m3u' }))
  .toMatchObject({
    epgUrls: ['https://epg.example/guide.xml'],
    channels: [
      {
        tvgId: 'news.tr',
        name: 'Haber 1',
        groupTitle: 'Haber',
        streamUrl: 'https://cdn.example/live/index.m3u8?token=abc#edge',
      },
      {
        name: 'Belgesel',
        streamUrl: 'https://lists.example/relative/stream.m3u8',
      },
    ],
  })
```

- [x] **Step 2: Run** `npx vitest run apps/web/src/iptv/m3u-parser.test.ts` and confirm RED because parser modules do not exist.
- [x] **Step 3: Implement the minimal parser** with line-oriented state: parse header attributes, hold one pending `#EXTINF` record, allow `#EXTGRP` to fill an absent group, consume the next non-comment line as its URL, emit warnings instead of throwing for malformed entries, normalize/dedupe EPG URLs, and dedupe channels by `${tvgId ?? ''}\u0000${streamUrl}`.
- [x] **Step 4: Run parser tests** and confirm PASS.
- [x] **Step 5: Write channel-filter RED tests** proving case-insensitive search across name/tvg-name/tvg-id/group/stream host, exact group filtering, `Grupsuz` support via an internal empty-group sentinel, alphabetical group enumeration, and unchanged input order.
- [x] **Step 6: Implement `filterIptvChannels()` and `listIptvGroups()`**, run both focused test files and `npm run typecheck -w @livetv/web`, confirm PASS. Evidence: 9/9 focused tests pass; web typecheck exits 0.
- [x] **Step 7: Commit** with `feat: add extended M3U parser`.

---

### Task 2: Dedicated IndexedDB IPTV repository

**Files:**

- Create: `apps/web/src/iptv/iptv-db.ts`
- Create: `apps/web/src/iptv/iptv-repository.ts`
- Create: `apps/web/src/iptv/iptv-repository.test.ts`

**Interfaces:**

```ts
export type IptvListSourceType = 'url' | 'file' | 'paste'

export type IptvList = {
  id: string
  name: string
  sourceType: IptvListSourceType
  sourceUrl?: string
  epgUrls: string[]
  importedAt: number
  updatedAt: number
  channelCount: number
}

export type IptvChannel = ParsedIptvChannel & {
  id: string
  listId: string
  position: number
  searchText: string
}

export type ImportIptvListInput = {
  name: string
  sourceType: IptvListSourceType
  sourceUrl?: string
  epgUrls: string[]
  channels: ParsedIptvChannel[]
  importedAt?: number
}

export interface IptvRepository {
  importList(input: ImportIptvListInput): Promise<IptvList>
  replaceList(id: string, input: ImportIptvListInput): Promise<IptvList>
  listLists(): Promise<IptvList[]>
  getList(id: string): Promise<IptvList | null>
  deleteList(id: string): Promise<void>
  listChannels(listId: string): Promise<IptvChannel[]>
}

export async function createIptvRepository(options?: {
  databaseName?: string
}): Promise<IptvRepository>
```

- [x] **Step 1: Write repository RED tests** using `fake-indexeddb/auto`. Cover import/reload persistence, channel order, multiple-list isolation, delete cascade, malformed persisted-row filtering, and source metadata preservation.
- [x] **Step 2: Add a transaction-abort test for `replaceList()`**: inject a test database state, cause a replacement write to reject, and assert the previous list/channels still read back unchanged.
- [x] **Step 3: Run** `npx vitest run apps/web/src/iptv/iptv-repository.test.ts` and confirm RED because repository modules do not exist.
- [x] **Step 4: Implement `livetv-iptv` version 1 schema** with `lists` and `channels` stores plus `listId`, `[listId, groupTitle]`, and `[listId, position]` indexes. Use deterministic channel IDs derived from list ID + `tvg-id` + stream URL; keep `position` separate.
- [x] **Step 5: Implement repository operations**. `replaceList()` must delete old channel rows and write replacement rows in the same `readwrite` transaction as the list metadata update so abort preserves the previous transaction state.
- [x] **Step 6: Add strict read guards** for list/channel rows; malformed rows are skipped rather than thrown to consumers.
- [x] **Step 7: Run repository tests**, web typecheck, and `npm run licenses:check`; confirm PASS with no new runtime package. Evidence: 6/6 repository tests, web typecheck exit 0, license policy passes 19 dependencies.
- [x] **Step 8: Commit** with `feat: add persistent IPTV repository`.

---

### Task 3: URL/file/paste import service

**Files:**

- Create: `apps/web/src/iptv/iptv-import-service.ts`
- Create: `apps/web/src/iptv/iptv-import-service.test.ts`

**Interfaces:**

```ts
export const IPTV_MAX_IMPORT_BYTES = 10 * 1024 * 1024

export type IptvImportResult = {
  playlist: ParsedM3uPlaylist
  suggestedName: string
}

export async function importIptvFromUrl(
  input: string,
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number },
): Promise<IptvImportResult>

export async function importIptvFromFile(file: File): Promise<IptvImportResult>

export function importIptvFromText(
  text: string,
  options?: { suggestedName?: string },
): IptvImportResult
```

- [x] **Step 1: Write RED tests** for successful URL import, non-2xx response, abort/timeout mapping, URL protocol rejection, `Content-Length` over 10 MiB, actual response body over 10 MiB, file size over 10 MiB, suggested-name generation, valid channels with warnings, and zero-valid-channel rejection.
- [x] **Step 2: Run focused tests** and confirm RED.
- [x] **Step 3: Implement bounded URL fetch** using `AbortController`, HTTP(S)-only input validation, response-size checks, and `parseM3u(text, { baseUrl: url })`.
- [x] **Step 4: Implement file/paste paths**. File uses `file.text()` and no base URL; paste uses the supplied/default name and no base URL. Both reject payloads above 10 MiB and zero-valid-channel results.
- [x] **Step 5: Run import-service + parser tests and web typecheck**; confirm PASS. Evidence: 15/15 focused tests and web typecheck exit 0.
- [x] **Step 6: Commit** with `feat: add IPTV import service`.

---

### Task 4: IPTV React controller/provider and refresh failure isolation

**Files:**

- Create: `apps/web/src/iptv/iptv-context.tsx`
- Create: `apps/web/src/iptv/iptv-context.test.tsx`
- Modify: `apps/web/src/App.tsx`

**Interfaces:**

```ts
export type IptvSnapshot = {
  status: 'loading' | 'ready' | 'unavailable'
  lists: readonly IptvList[]
  activeListId: string | null
  channels: readonly IptvChannel[]
  errorMessage?: string
}

export type IptvController = {
  getSnapshot(): IptvSnapshot
  subscribe(listener: () => void): () => void
  initialize(): Promise<void>
  importUrl(url: string, name?: string): Promise<void>
  importFile(file: File, name?: string): Promise<void>
  importText(text: string, name?: string): Promise<void>
  selectList(id: string | null): Promise<void>
  refreshList(id: string): Promise<void>
  deleteList(id: string): Promise<void>
}
```

- [x] **Step 1: Write controller RED tests** using a small memory repository/import-service seam. Prove initialize loads lists + first list channels, import selects the new list, selecting lists swaps channel state, delete chooses a remaining list or null, and repository initialization failure becomes `unavailable`.
- [x] **Step 2: Add refresh-failure RED test** proving a failed URL fetch leaves the current stored list/channels visible and exposes a non-destructive error message.
- [x] **Step 3: Run focused test and confirm RED.**
- [x] **Step 4: Implement controller snapshot/subscription operations** and `IptvProvider`/`useIptv()` using `useSyncExternalStore`, following the P3 library context pattern without sharing repositories.
- [x] **Step 5: Wrap application content with `IptvProvider` inside/alongside the existing `LibraryProvider`** so all routes continue to render if IPTV storage is unavailable.
- [x] **Step 6: Run context tests, existing `App.test.tsx`, and web typecheck**; confirm PASS. Evidence: 10/10 focused + App tests, web typecheck exit 0.
- [x] **Step 7: Commit** with `feat: expose IPTV library state to React`.

---

### Task 5: Functional `/iptv` library UI and common UnifiedPlayer request

**Files:**

- Create: `apps/web/src/components/IptvLibrary.tsx`
- Create: `apps/web/src/components/IptvLibrary.test.tsx`
- Create: `apps/web/src/player/player-open-request.ts`
- Create: `apps/web/src/player/player-open-request.test.ts`
- Modify: `apps/web/src/library/library-player-request.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/RouteContent.tsx`
- Modify: `apps/web/src/components/UnifiedPlayer.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**

Generalize playback requests to raw URL + preference + metadata instead of making the app request type depend on `LibrarySource`:

```ts
export type PlayerOpenRequest = {
  id: number
  url: string
  preference: PlayerSourcePreference
  title?: string
  thumbnailUrl?: string
  channelUrl?: string
}

export function createPlayerOpenRequest(
  previousId: number,
  input: Omit<PlayerOpenRequest, 'id'>,
): PlayerOpenRequest

export function playerRequestForLibrarySource(
  previousId: number,
  source: LibrarySource,
): PlayerOpenRequest

export function playerRequestForIptvChannel(
  previousId: number,
  channel: IptvChannel,
): PlayerOpenRequest
```

IPTV preference helper:

```ts
export function playerPreferenceForIptvChannel(
  channel: ParsedIptvChannel,
): PlayerSourcePreference
```

`.m3u8` pathname -> `hls`; other HTTP(S) streams -> `auto`.

- [x] **Step 1: Write player-request RED tests** proving P3 saved-source semantics remain unchanged and IPTV `.m3u8`/extensionless streams generate the correct common request.
- [x] **Step 2: Implement common request module** and keep `library-player-request.ts` as a compatibility wrapper/re-export where useful so existing tests/callers transition cleanly.
- [x] **Step 3: Write `IptvLibraryView` RED render tests** for ready, loading, unavailable, stored-list metadata, URL-only refresh button, search/group controls, result count, first-200 limit, and `Daha fazla göster` visibility.
- [x] **Step 4: Implement `IptvLibrary` container/view** with URL import, hidden file input, paste section, selected list, search/group filtering via Task 1 helpers, 200-row paging, refresh, delete, and per-channel **Oynat** action.
- [x] **Step 5: Route `/iptv` to `IptvLibrary`** instead of the generic `SourceContent`. Keep the right-side UnifiedPlayer visible.
- [x] **Step 6: Update `App` replay coordination** so History/Playlist and IPTV both create common `PlayerOpenRequest`s. Update `UnifiedPlayer` to consume `request.url`, `request.preference`, and optional metadata once per request ID. Preserve direct manual URL behavior.
- [x] **Step 7: Ensure the active IPTV source's title/logo metadata flows into P3 history/favorites** after real `playing`, without creating a duplicate history path.
- [x] **Step 8: Run** player-request, IPTV UI, App, P3 library, UnifiedPlayer-related tests and web typecheck; confirm PASS. Evidence: 21/21 focused + responsive tests, web typecheck exit 0.
- [x] **Step 9: Commit** with `feat: add functional IPTV channel library`.

---

### Task 6: Documentation, regression verification, Docker/browser acceptance, PR integration

**Files:**

- Modify: `README.md`
- Modify: `apps/web/src/app-meta.ts`
- Modify: `apps/web/src/app-meta.test.ts`
- Modify: `apps/web/src/components/Navigation.tsx`
- Modify: this plan for evidence/checkmarks.

- [ ] **Step 1: Update milestone copy** from P3 to P4 where it describes the current repository phase. Sidebar phase card becomes `P4` / `IPTV & M3U library`; historical references to P2/P3 remain where they describe earlier architecture.
- [ ] **Step 2: Update README** with URL/file/paste imports, `livetv-iptv`, 10 MiB limit, CORS behavior, URL refresh semantics, search/groups, existing-player handoff, EPG metadata preservation, and no-proxy/no-XMLTV boundaries.
- [ ] **Step 3: Run full local quality gate:** `npm run verify`, `git diff --check`, `docker compose config`. Expected: zero failures; existing HLS chunk-size warning may remain non-fatal.
- [ ] **Step 4: Docker rebuild/acceptance:** preserve the server-only YouTube API key without printing it, rebuild `web/api/media-worker`, verify `/`, `/api/health`, `/media/health`, and the existing Halk TV Data API resolver.
- [ ] **Step 5: Browser acceptance with Chrome DevTools:** import a deterministic M3U fixture through paste or file; verify list persistence, channel count, group filter, search, channel open in UnifiedPlayer, hard-reload persistence, and list deletion cascade. Also verify P3 favorites/history/playlists remain usable and application console is clean.
- [ ] **Step 6: URL-refresh acceptance:** where a deterministic local/static HTTP M3U fixture can be served through the existing development web origin, import it by URL, update the fixture or use a controlled variant, press **Yenile**, and verify replacement. If the fixture intentionally fails, verify old stored rows remain visible.
- [ ] **Step 7: Mark plan evidence and commit** with `chore: complete P4 IPTV M3U milestone`.
- [ ] **Step 8: Fresh verification before integration:** run `npm test`, secret scan tracked/staged content, and confirm worktree clean after milestone commit.
- [ ] **Step 9: Push detached worktree HEAD as `feat/p4-iptv-m3u-library`, open a PR to `main`, wait for `verify` + `dependency-review`, fix actionable failures, merge when green, fast-forward normal local `main`, preserve ignored `.env`, update the plan's integration checkbox, push that final docs commit, and run `npm run verify` on the final pushed `main` checkout.

## Exit Criteria

- [ ] URL, file, and pasted-text M3U imports work.
- [ ] Extended M3U metadata and EPG references are parsed/preserved.
- [ ] Imported IPTV lists/channels persist across reloads in `livetv-iptv`.
- [ ] Multiple lists remain isolated and deleting a list removes its channels.
- [ ] URL-list refresh is transactional and failed refresh does not destroy old data.
- [ ] Search, group filtering, and incremental rendering work.
- [ ] IPTV channel playback uses the existing UnifiedPlayer.
- [ ] Playing IPTV channels remains compatible with P3 history/favorites/playlists.
- [ ] IPTV storage/import failure leaves direct playback usable.
- [ ] No generic backend proxy, XMLTV rendering, auth/sync, torrent, recording, or download dependency is introduced.
- [ ] Full verification, Docker acceptance, browser persistence/playback acceptance, GitHub CI, merge, and final-main verification pass.
