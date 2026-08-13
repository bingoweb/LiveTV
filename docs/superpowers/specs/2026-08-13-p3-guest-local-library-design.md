# P3 Guest Local Library Design

## Goal

Add a persistent, account-free local library to LiveTV so a guest user can keep playback history, favorites, and custom playlists on the current device without introducing authentication or server synchronization.

## Scope

P3 includes:

- persistent playback history,
- favorites,
- user-created playlists,
- add/remove/reorder playlist items,
- player actions for favoriting and adding the current source to a playlist,
- functional `/history` and `/playlists` routes,
- local schema versioning and migration boundaries,
- graceful degradation when browser storage is unavailable.

P3 does not include:

- accounts or authentication,
- PostgreSQL-backed user libraries,
- cross-device synchronization,
- cloud backup,
- watch-progress/resume positions,
- downloads, recording, or offline media caching,
- responsive visual redesign beyond fitting the new controls into the existing P1 shell.

## Storage architecture

Use the browser's native IndexedDB API with no new runtime persistence dependency. The implementation lives under `apps/web/src/library/` and is split into small units:

- `library-types.ts` defines public records and write inputs.
- `source-key.ts` derives a stable identity for a playable source.
- `library-db.ts` owns IndexedDB database creation, object stores, indexes, and schema version upgrades.
- `library-repository.ts` exposes history/favorite/playlist operations and hides IndexedDB details from React and the player.
- `library-store.ts` provides a small subscription/state layer for React consumers and refreshes from the repository after mutations.

`packages/player-core` remains persistence-agnostic. The web player reports application-level playback events to the library layer; the library layer never reaches into player adapters.

## Database schema

Database name: `livetv-library`.

Initial schema version: `1`.

### `history` object store

Key path: `sourceKey`.

Record fields:

- `sourceKey: string`
- `url: string`
- `kind: 'youtube' | 'hls' | 'video' | 'audio'`
- `title: string`
- `thumbnailUrl?: string`
- `channelUrl?: string`
- `lastPlayedAt: number`
- `playCount: number`

Index: `lastPlayedAt`.

History behavior:

- Replaying the same `sourceKey` updates the existing record instead of creating a duplicate.
- `playCount` increments on each accepted playback-start event.
- `lastPlayedAt` is replaced with the newest timestamp.
- Keep at most 200 history records. After inserting/updating a record, delete the oldest records beyond 200.
- A history record is created only after playback reaches a real `playing` state. Merely resolving/loading a source is not enough.

### `favorites` object store

Key path: `sourceKey`.

Record fields:

- the same source identity fields as history,
- `addedAt: number`.

Favorites are unique by `sourceKey`. Adding an existing favorite updates metadata while preserving the original `addedAt` value.

### `playlists` object store

Key path: `id`.

Record fields:

- `id: string`
- `name: string`
- `createdAt: number`
- `updatedAt: number`

Playlist and playlist-item IDs are generated with `crypto.randomUUID()` when available, with a timestamp/random fallback for older environments.

Playlist names are trimmed, must contain at least one non-whitespace character, and are limited to 80 characters.

### `playlistItems` object store

Key path: `id`.

Record fields:

- `id: string`
- `playlistId: string`
- source identity fields,
- `position: number`
- `addedAt: number`.

Indexes:

- `playlistId`
- compound `[playlistId, position]`
- compound `[playlistId, sourceKey]` with `unique: true`.

Adding the same source to the same playlist is idempotent. Reordering rewrites contiguous positions starting at `0` in one transaction.

Deleting a playlist also deletes all of its playlist items in the same logical operation.

## Stable source identity

Every library record uses a `sourceKey` so history, favorites, and playlist membership can deduplicate reliably.

Rules:

1. YouTube video sources use `youtube:<videoId>`.
2. Other sources use `<kind>:<normalized-url>`.
3. URL normalization removes the fragment and preserves query parameters because signed/direct media URLs may depend on them.
4. Host names are lowercased by the URL parser; path/query content is otherwise preserved.
5. If a URL cannot be parsed as HTTP(S), fall back to the trimmed original string instead of throwing from the identity helper.

Channel live discovery is recorded using the resolved current video ID when playback actually starts, so changing live broadcast IDs become distinct history entries while a repeated open of the same current broadcast remains deduplicated.

## Repository interface

The repository exposes asynchronous operations only:

- `recordPlayback(source, playedAt?)`
- `listHistory()`
- `removeHistory(sourceKey)`
- `clearHistory()`
- `addFavorite(source, addedAt?)`
- `removeFavorite(sourceKey)`
- `isFavorite(sourceKey)`
- `listFavorites()`
- `createPlaylist(name)`
- `renamePlaylist(id, name)`
- `deletePlaylist(id)`
- `listPlaylists()`
- `addPlaylistItem(playlistId, source)`
- `removePlaylistItem(itemId)`
- `reorderPlaylistItems(playlistId, orderedItemIds)`
- `listPlaylistItems(playlistId)`

All list methods return newest-first for history/favorites/playlists, except playlist items which return ascending `position`.

## React integration

The web app owns one library repository/store instance per page session.

The store exposes:

- current history,
- current favorites,
- current playlists,
- selected playlist items on demand,
- `ready` / `unavailable` state,
- mutation methods that refresh the relevant slices after a successful write.

React components consume the store through a context/provider and hooks instead of importing IndexedDB helpers directly.

## Player integration

`UnifiedPlayer` receives library actions through the application context.

When player state transitions to `playing` for the current source, record playback once for that playback session/source transition. Pause/resume events for the same loaded source must not repeatedly increment history.

The player surface adds functional actions:

- favorite/unfavorite the active source,
- add the active source to an existing playlist,
- create a playlist and add the active source in the same interaction.

These controls are disabled when there is no active playable source or local storage is unavailable.

## Route behavior

### `/history`

Replace the placeholder with a functional history view showing newest items first. Each item supports:

- play again,
- favorite/unfavorite,
- remove from history.

The route also exposes `Geçmişi temizle`. Clearing history does not touch favorites or playlists.

### `/playlists`

Replace the placeholder with a library view containing:

- a Favorites section,
- custom playlist list/create/rename/delete controls,
- selected playlist contents,
- play item,
- remove item,
- move item up/down.

No additional top-level navigation item is added for Favorites in P3.

## Error handling and resilience

If IndexedDB is unavailable, blocked, or fails to open:

- playback remains fully functional,
- the library store enters `unavailable`,
- history/favorite/playlist controls are disabled,
- `/history` and `/playlists` show a concise local-storage-unavailable message instead of crashing.

Individual malformed records encountered during reads are skipped where possible. A malformed record must not prevent valid records from rendering.

Repository errors are surfaced to the store as operation failures and must not leave optimistic UI state that was not persisted.

## Migration policy

All schema changes increment the IndexedDB database version and live inside `library-db.ts` upgrade handling. Upgrade code must be additive or explicitly transform/delete obsolete data. Future account synchronization must consume repository-level records rather than depending on raw IndexedDB store structure.

## Testing strategy

Unit/integration tests cover:

- source-key normalization and YouTube identity,
- IndexedDB schema creation,
- duplicate history updates and play-count increments,
- 200-entry history retention,
- favorite idempotency,
- playlist validation and rename/delete behavior,
- duplicate playlist-item prevention,
- stable playlist ordering/reordering,
- storage-unavailable behavior,
- React history and playlist route rendering/mutations,
- player playback-start history recording once per loaded source,
- player favorite and playlist actions.

Use an IndexedDB-compatible test implementation only as a development/test dependency if Node's test environment cannot provide IndexedDB. Do not introduce a runtime wrapper such as Dexie for P3.

Browser acceptance in Chrome DevTools must prove that history/favorites/playlists survive a hard page reload and that clearing history does not erase favorites or playlists.

## Exit criteria

- A successfully playing source appears in history and remains after reload.
- Replaying the same source updates one history row instead of duplicating it.
- History never retains more than 200 entries.
- The current source can be favorited and unfavorited persistently.
- Users can create, rename, delete, populate, and reorder custom playlists.
- `/history` and `/playlists` are functional rather than placeholders.
- Storage failure does not break media playback.
- No account, auth, server-library, or sync dependency is introduced.
- `npm run verify`, Docker acceptance, and browser persistence acceptance all pass.

The P3 implementation is complete only when these criteria are proven on the merged code path; documentation-only completion does not count.
