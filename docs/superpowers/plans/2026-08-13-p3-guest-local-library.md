# P3 Guest Local Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add account-free, device-local playback history, favorites, and custom playlists backed by native IndexedDB and integrated with the existing unified player.

**Architecture:** Persistence lives under `apps/web/src/library/`. IndexedDB is hidden behind a repository, React consumes a context/store API, and `UnifiedPlayer` reports application-level events without adding persistence to `@livetv/player-core`. `/history` and `/playlists` become functional while the existing P1 responsive shell remains structurally unchanged.

**Tech Stack:** React 19, TypeScript 6, native IndexedDB, Vitest, and `fake-indexeddb` only as a test dependency if Node does not provide IndexedDB.

## Global Constraints

- No account/authentication, PostgreSQL user library, cloud backup, or cross-device sync.
- No watch-progress/resume persistence.
- No downloads, recording, or offline media caching.
- No runtime IndexedDB wrapper such as Dexie.
- Keep at most 200 history records.
- Record history only after a real `playing` state, once per loaded source session.
- Storage failure must not break media playback.
- Responsive visual redesign remains out of scope.

---

### Task 1: Stable library source identity

**Files:**

- Create: `apps/web/src/library/library-types.ts`
- Create: `apps/web/src/library/source-key.ts`
- Test: `apps/web/src/library/source-key.test.ts`

**Interfaces:**

- Consumes: `PlayerSource` from `@livetv/player-core`.
- Produces: `LibrarySource`, `LibrarySourceKind`, `createSourceKey()`, `toLibrarySource()`.

- [x] **Step 1: Write failing tests** for YouTube ID identity, HLS/direct URL identity, fragment removal, query preservation, and direct audio/video distinction.
- [x] **Step 2: Run** `npx vitest run apps/web/src/library/source-key.test.ts` and confirm RED because implementation is missing.
- [x] **Step 3: Implement source mapping** with these exact rules:

```ts
youtube -> `youtube:${source.videoId}`
hls -> `hls:${normalizedUrl}`
direct audio -> `audio:${normalizedUrl}`
direct video -> `video:${normalizedUrl}`
```

`normalizedUrl` must clear URL fragments and preserve query parameters. `LibrarySource` contains `sourceKey`, `url`, `kind`, `title`, optional `thumbnailUrl`, and optional `channelUrl`.

- [x] **Step 4: Run** focused tests plus `npm run typecheck --workspace @livetv/web` and confirm PASS.
- [x] **Step 5: Commit** with `feat: define local library source identity`.

---

### Task 2: IndexedDB schema and repository

**Files:**

- Create: `apps/web/src/library/library-db.ts`
- Create: `apps/web/src/library/library-repository.ts`
- Test: `apps/web/src/library/library-repository.test.ts`
- Modify: root `package.json` and `package-lock.json` only if `fake-indexeddb` is needed.

**Interfaces:**

```ts
type HistoryEntry = LibrarySource & { lastPlayedAt: number; playCount: number }
type FavoriteEntry = LibrarySource & { addedAt: number }
type Playlist = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}
type PlaylistItem = LibrarySource & {
  id: string
  playlistId: string
  position: number
  addedAt: number
}
```

Repository methods: `recordPlayback`, `listHistory`, `removeHistory`, `clearHistory`, `addFavorite`, `removeFavorite`, `isFavorite`, `listFavorites`, `createPlaylist`, `renamePlaylist`, `deletePlaylist`, `listPlaylists`, `addPlaylistItem`, `removePlaylistItem`, `reorderPlaylistItems`, `listPlaylistItems`.

- [x] **Step 1: Write failing repository tests** proving schema v1, history dedupe/play-count, 200-row retention, favorite idempotency, playlist-name validation, duplicate playlist-item prevention, contiguous reorder, cascade item deletion, and history clear isolation.
- [x] **Step 2: Run** `npx vitest run apps/web/src/library/library-repository.test.ts` and confirm RED.
- [x] **Step 3: Check Node IndexedDB** with `node -e "console.log(typeof indexedDB)"`. If unavailable, install `fake-indexeddb` with `npm install --save-dev fake-indexeddb`; import it only in tests.
- [x] **Step 4: Implement IndexedDB v1** named `livetv-library` with stores `history`, `favorites`, `playlists`, `playlistItems`; add indexes required by the spec, including unique `[playlistId, sourceKey]`.
- [x] **Step 5: Implement repository transactions**. `recordPlayback` trims oldest history after write. `deletePlaylist` removes its items. Reorder validates exact current membership before assigning positions `0..n-1`.
- [x] **Step 6: Run** focused tests, web typecheck, and `npm run licenses:check`; confirm PASS.
- [x] **Step 7: Commit** with `feat: add IndexedDB guest library repository`.

---

### Task 3: React library context and failure isolation

**Files:**

- Create: `apps/web/src/library/library-context.tsx`
- Test: `apps/web/src/library/library-context.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**

```ts
type LibraryStatus = 'loading' | 'ready' | 'unavailable'

type LibraryContextValue = {
  status: LibraryStatus
  history: readonly HistoryEntry[]
  favorites: readonly FavoriteEntry[]
  playlists: readonly Playlist[]
  recordPlayback(source: LibrarySource): Promise<void>
  toggleFavorite(source: LibrarySource): Promise<void>
  createPlaylist(name: string): Promise<Playlist>
  renamePlaylist(id: string, name: string): Promise<void>
  deletePlaylist(id: string): Promise<void>
  addToPlaylist(playlistId: string, source: LibrarySource): Promise<void>
  removePlaylistItem(itemId: string): Promise<void>
  reorderPlaylistItems(
    playlistId: string,
    ids: readonly string[],
  ): Promise<void>
  listPlaylistItems(playlistId: string): Promise<PlaylistItem[]>
  removeHistory(sourceKey: string): Promise<void>
  clearHistory(): Promise<void>
}
```

- [x] **Step 1: Write failing context tests** using an injected fake repository for initial load, post-write refresh, and open failure -> `unavailable` without render crash.
- [x] **Step 2: Run** `npx vitest run apps/web/src/library/library-context.test.tsx apps/web/src/App.test.tsx` and confirm RED.
- [x] **Step 3: Implement `LibraryProvider` and `useLibrary()`** with one repository instance per page session. Persist first, then refresh state; do not leave optimistic state after failed writes.
- [x] **Step 4: Wrap `App`** so route content and player share the same provider.
- [x] **Step 5: Run** focused tests and web typecheck; confirm PASS.
- [x] **Step 6: Commit** with `feat: expose guest library state to React`.

---

### Task 4: Functional history and playlists routes

**Files:**

- Create: `apps/web/src/components/HistoryLibrary.tsx`
- Test: `apps/web/src/components/HistoryLibrary.test.tsx`
- Create: `apps/web/src/components/PlaylistsLibrary.tsx`
- Test: `apps/web/src/components/PlaylistsLibrary.test.tsx`
- Modify: `apps/web/src/components/RouteContent.tsx`
- Modify: `apps/web/src/styles.css`

- [x] **Step 1: Write failing History tests** for newest-first rendering, play-again callback, favorite toggle, single-row removal, clear history, and unavailable message.
- [x] **Step 2: Write failing Playlists tests** for favorites, create/rename/delete, item removal, up/down reorder, and unavailable message.
- [x] **Step 3: Run both component tests** and confirm RED.
- [x] **Step 4: Implement `/history` view** using existing card/button language; `Geçmişi temizle` touches only history.
- [x] **Step 5: Implement `/playlists` view** with Favorites plus custom playlists. Use explicit up/down buttons, not drag-and-drop. Do not add a Favorites navigation route.
- [x] **Step 6: Replace P3 placeholder copy** in `RouteContent`; route `history` and `playlists` to the new components.
- [x] **Step 7: Add minimal CSS** within existing theme/breakpoints; no visual redesign.
- [x] **Step 8: Run** focused tests and web typecheck; confirm PASS.
- [x] **Step 9: Commit** with `feat: add persistent history and playlist views`.

---

### Task 5: Unified player library integration

**Files:**

- Create: `apps/web/src/library/playback-history-session.ts`
- Test: `apps/web/src/library/playback-history-session.test.ts`
- Create: `apps/web/src/components/LibrarySourceActions.tsx`
- Test: `apps/web/src/components/LibrarySourceActions.test.tsx`
- Modify: `apps/web/src/components/UnifiedPlayer.tsx`
- Modify: `apps/web/src/styles.css`

**Interfaces:**

```ts
shouldRecordPlayback(
  previousRecordedSourceKey: string | null,
  state: PlayerUiState,
  source: LibrarySource | null,
): { record: boolean; nextRecordedSourceKey: string | null }
```

- [x] **Step 1: Write failing session tests** proving only the first `playing` for a loaded source records, pause/resume does not duplicate, changing source records again, and clearing source resets the guard.
- [x] **Step 2: Write failing source-action tests** for favorite/unfavorite, add to existing playlist, create playlist + add, and disabled behavior when no source/storage unavailable.
- [x] **Step 3: Run focused tests** and confirm RED.
- [x] **Step 4: Integrate player history recording** by converting active `PlayerSource` to `LibrarySource`; record only after the real player state becomes `playing`.
- [x] **Step 5: Add active-source library actions** to the existing footer without disturbing play/pause, quality selection, or YouTube external-open behavior.
- [x] **Step 6: Run** focused tests and web typecheck; confirm PASS.
- [x] **Step 7: Commit** with `feat: connect player to guest library`.

---

### Task 6: Replay coordination, docs, verification, and integration

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/RouteContent.tsx`
- Modify: `apps/web/src/components/UnifiedPlayer.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Modify: `README.md`
- Modify: this plan for evidence/checkmarks.

**Interface:** one app-level request sends a library source back into the existing unified player:

```ts
type PlayerOpenRequest = { id: number; source: LibrarySource }
```

- [x] **Step 1: Add failing replay test** proving History/Playlist `Oynat` sends the source into the same unified player path.
- [x] **Step 2: Implement request handoff**. `UnifiedPlayer` consumes each request once and derives player preference from `LibrarySource.kind` (`youtube`, `hls`, `direct-video`, `direct-audio`).
- [x] **Step 3: Update README** with P3 status, `livetv-library`, 200-entry history cap, device-local persistence, unavailable-storage behavior, and explicit no-auth/no-sync/no-resume boundaries.
- [x] **Step 4: Run full quality gate:** `npm run verify`, `git diff --check`, `docker compose config`.
- [x] **Step 5: Run Docker acceptance** and verify `/`, `/api/health`, `/media/health`, plus existing YouTube live resolver without printing secrets.
- [x] **Step 6: Run Chrome DevTools persistence acceptance:** play source -> history; favorite; create playlist/add source; hard reload; confirm all survive; clear history; confirm favorites/playlists remain; confirm no application console errors.
- [x] **Step 7: Mark evidence/checks in this plan and commit** with `chore: complete P3 guest local library milestone`.
- [ ] **Step 8: Push `feat/p3-guest-local-library`, open PR, wait for CI, fix actionable failures, merge when green, then fast-forward the normal local `main` checkout while preserving ignored `.env` secrets.**

## Exit Criteria

- [x] Successfully playing sources persist in history across reload.
- [x] Pause/resume does not repeatedly increment the same loaded-source history entry.
- [x] History retains at most 200 records.
- [x] Favorites persist and deduplicate.
- [x] Custom playlists support create, rename, delete, add/remove, and reorder.
- [x] `/history` and `/playlists` are functional.
- [x] History/playlist replay uses the existing unified player.
- [x] IndexedDB failure leaves playback functional.
- [x] No auth/server-sync/watch-progress dependency is introduced.
- [x] Full verification, Docker acceptance, and browser persistence acceptance pass.

## Verification Evidence

- `npm run verify`: 26 test files / 85 tests passed; Prettier, ESLint, all-workspace TypeScript, builds, and direct dependency license policy passed. The existing HLS chunk-size warning remains non-fatal.
- `git diff --check` and `docker compose config`: passed before final container acceptance.
- Docker acceptance on the P3 worktree image: `/`, `/api/health`, and `/media/health` returned successfully; Halk TV resolved live through `discoveryMethod: data-api` with `officialApiAvailable: true`.
- Chrome DevTools acceptance: Halk TV reached the real `Oynatılıyor` state, creating one `youtube:FmwMSdSLmQg` history row. Favorite and `P3 Test Listesi` playlist/item were persisted in `livetv-library`.
- Hard reload preserved history/favorite/playlist/item as `1/1/1/1`. History and playlist `Oynat` actions each reopened the saved broadcast in the same UnifiedPlayer.
- Clearing history changed IndexedDB counts to `history=0`, `favorites=1`, `playlists=1`, `playlistItems=1`; a later hard reload on the final image preserved those counts.
- Final browser console inspection returned no application warnings or errors, and the rendered milestone badge reads `P3 / Guest local library`.
- Repository regression coverage now also injects malformed IndexedDB rows and verifies valid history, favorite, playlist, and playlist-item data remains readable.
