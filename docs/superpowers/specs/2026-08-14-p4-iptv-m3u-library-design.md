# P4 IPTV / M3U Library Design

## Goal

Add a persistent, browser-first IPTV channel library to LiveTV. A user must be able to import an extended M3U playlist, keep it on the current device, browse/search/group channels, refresh URL-backed lists, and send any channel into the existing UnifiedPlayer without adding a second playback path.

## Product boundary

P4 implements IPTV list ingestion and local channel-library behavior. It does not implement XMLTV rendering, authenticated server synchronization, a generic server-side media proxy, recording, downloading, or torrent streaming.

The existing direct URL field remains available. A single `.m3u8` stream can still be opened directly in UnifiedPlayer; the new IPTV library is for multi-channel M3U lists.

## Import sources

P4 supports three user-controlled import paths:

1. **URL import** — fetch an HTTP(S) M3U document in the browser.
2. **Local file import** — read a user-selected `.m3u` or `.m3u8` text file with the File API.
3. **Paste import** — parse M3U text pasted directly into the application.

URL import deliberately remains browser-side. LiveTV must not add an unauthenticated arbitrary-URL backend fetch/proxy endpoint merely to bypass CORS. If the upstream playlist does not allow browser access, the UI explains that limitation and keeps file/paste import available.

## Parser

The parser is a pure TypeScript module under `apps/web/src/iptv/` and has no React or IndexedDB dependency.

Supported extended-M3U features:

- `#EXTM3U`
- header attributes such as `url-tvg`, `x-tvg-url`, and `tvg-url`
- `#EXTINF`
- quoted and unquoted attributes
- `tvg-id`
- `tvg-name`
- `tvg-logo`
- `group-title`
- `#EXTGRP`
- the media URL immediately following a channel metadata block

Each parsed channel contains:

```ts
type ParsedIptvChannel = {
  name: string
  streamUrl: string
  tvgId?: string
  tvgName?: string
  logoUrl?: string
  groupTitle?: string
}

type ParsedM3uPlaylist = {
  channels: ParsedIptvChannel[]
  epgUrls: string[]
  warnings: M3uParseWarning[]
}
```

Parsing rules:

- Only HTTP(S) channel URLs are accepted by P4.
- Blank lines and unknown comment directives are ignored.
- A malformed channel entry is skipped and recorded as a warning instead of failing the entire playlist.
- Duplicate channels inside one import are deduplicated by normalized stream URL plus `tvg-id` when available.
- For URL imports, relative channel URLs are resolved against the playlist URL.
- For file/paste imports, relative channel URLs are rejected because no trustworthy base URL exists.
- URL fragments are preserved for stream playback. Query parameters are never stripped because signed IPTV URLs may depend on them.
- Display name precedence is `tvg-name` when non-empty, then the text after the `#EXTINF` comma, then a deterministic fallback derived from the stream host/path.
- `#EXTGRP` is used only when `group-title` is absent.

## Persistence architecture

IPTV persistence is isolated from the P3 guest-library repository. P4 uses a dedicated IndexedDB database named `livetv-iptv` so history/favorites/playlists remain independently evolvable.

Database version 1 contains:

### `lists`

```ts
type IptvList = {
  id: string
  name: string
  sourceType: 'url' | 'file' | 'paste'
  sourceUrl?: string
  epgUrls: string[]
  importedAt: number
  updatedAt: number
  channelCount: number
}
```

### `channels`

```ts
type IptvChannel = ParsedIptvChannel & {
  id: string
  listId: string
  position: number
  searchText: string
}
```

Indexes:

- `channels.listId`
- `channels.listGroup` over `[listId, groupTitle]`
- `channels.listPosition` over `[listId, position]`

Repository operations are asynchronous and are the only IndexedDB surface consumed by React:

```ts
interface IptvRepository {
  importList(input: ImportIptvListInput): Promise<IptvList>
  replaceList(id: string, input: ImportIptvListInput): Promise<IptvList>
  listLists(): Promise<IptvList[]>
  getList(id: string): Promise<IptvList | null>
  deleteList(id: string): Promise<void>
  listChannels(listId: string): Promise<IptvChannel[]>
}
```

`importList` and `replaceList` write list metadata and channel rows in one read/write transaction. A failed replacement leaves the previous stored list intact.

Malformed persisted rows are filtered on read so one damaged row cannot make the entire IPTV library unusable.

## Stable channel identity

Channel IDs are deterministic within a stored list. They are derived from the list ID plus a stable channel key composed from `tvg-id` and normalized stream URL. The parser's order is stored separately in `position`.

This gives P4 two important behaviors:

- duplicate rows do not multiply during one import;
- a URL list refresh can replace channel content without coupling playback/history to database row order.

The existing P3 history/favorite source identity remains based on the actual `PlayerSource`, so playing an IPTV channel naturally becomes an HLS/direct library source using the same player-history behavior already implemented.

## Import service

`apps/web/src/iptv/iptv-import-service.ts` owns import I/O and leaves parsing/persistence separate.

Responsibilities:

- fetch URL text with a bounded timeout;
- reject non-2xx responses with a useful message;
- enforce a reasonable text-size limit before parsing to avoid accidentally loading an unbounded document into the UI;
- read File text;
- call the pure parser with the correct optional base URL;
- require at least one valid channel before persistence;
- return parse warnings to the UI without treating them as fatal when valid channels exist.

The initial text limit is **10 MiB**. The parser itself remains usable with ordinary strings and does not depend on fetch/file APIs.

## URL-list refresh

Only `sourceType: 'url'` lists expose **Yenile**.

Refresh flow:

1. Fetch the original `sourceUrl` again.
2. Parse into a complete new in-memory result.
3. If fetch or parse fails, leave the old list untouched and surface the error.
4. If parsing succeeds with at least one channel, replace the stored rows transactionally and update `updatedAt`, `channelCount`, and EPG metadata.

No periodic background refresh is introduced in P4. Refresh is explicit user action to avoid unnecessary upstream traffic and surprising list changes.

## React state boundary

`IptvProvider` wraps repository state similarly to the P3 library provider but is scoped only to IPTV concerns.

State:

```ts
type IptvState = {
  status: 'loading' | 'ready' | 'unavailable'
  lists: IptvList[]
  activeListId: string | null
  channels: IptvChannel[]
  errorMessage?: string
}
```

The provider exposes operations for import, refresh, delete, selecting a list, and reloading channels. IndexedDB failure disables only the saved IPTV library; the existing direct URL player continues to work.

## `/iptv` UI

The generic P3/P2 placeholder for `/iptv` becomes a functional IPTV library panel.

### Import controls

- URL input + **URL'den içe aktar**
- file picker accepting `.m3u,.m3u8,text/plain,application/vnd.apple.mpegurl`
- collapsible paste textarea + **Metni içe aktar**
- list-name field; URL imports default to hostname/path-derived name, file imports to filename, paste imports to `IPTV Listesi`

### Stored-list controls

- selected list dropdown/cards
- list name, channel count, last-updated timestamp
- **Yenile** only for URL lists
- **Listeyi sil**

The latest successful import/refresh may also expose a transient non-fatal parse warning count. P4 does not persist warning rows/counts after that feedback because they are diagnostics for the specific import operation rather than stable channel-library metadata.

### Channel browser

- search by channel name, `tvg-name`, `tvg-id`, group, and stream host
- group filter including `Tümü` and `Grupsuz`
- result count
- groups are derived from stored channels; no separate group store
- render the first 200 matching channels, with **Daha fazla göster** in increments of 200
- channel row/card shows logo when present, name, group, and compact source badge
- **Oynat** sends the selected channel to the existing UnifiedPlayer

P4 does not add drag/drop channel reordering or editing of individual M3U metadata. Imported order is preserved.

## UnifiedPlayer handoff

The existing application-level open-request mechanism is generalized from `LibrarySource` to a small common playback request that can be created from either P3 saved media or a P4 IPTV channel.

IPTV player preference rules:

- URL pathname ending in `.m3u8` -> explicit `hls`
- otherwise -> `auto`

No new player controller or browser adapter is introduced. Once the current UnifiedPlayer emits real `playing`, the existing P3 playback-history integration records the channel just like any other source.

## EPG metadata boundary

P4 preserves but does not consume:

- M3U header EPG URLs (`url-tvg`, `x-tvg-url`, `tvg-url`)
- per-channel `tvg-id`

The TV Guide route remains a later milestone. P4 must not fetch XMLTV documents or couple list import success to EPG availability.

## Error handling

User-visible failures include:

- URL fetch blocked or failed;
- playlist exceeds 10 MiB;
- no valid channels found;
- IndexedDB unavailable;
- URL-list refresh failed while old data was preserved.

Non-fatal conditions are reported as a transient warning count for the latest successful import/refresh, including malformed entries, unsupported URL protocols, relative URLs without a base, and channel metadata without a following URL.

The player remains usable even when IPTV persistence/import fails.

## Testing

### Parser tests

- extended attributes and comma-containing titles;
- `#EXTGRP` fallback;
- EPG header extraction;
- relative URL resolution for URL imports;
- relative URL rejection for file/paste imports;
- signed query preservation;
- malformed-row warnings;
- deduplication.

### Repository tests

- import and reload persistence;
- multiple lists remain isolated;
- replace is transactional;
- delete cascades to channels;
- malformed stored rows are skipped;
- imported position is preserved.

### Import-service tests

- successful URL fetch;
- non-2xx response;
- timeout/abort mapping;
- 10 MiB size rejection;
- valid channels plus warnings remain importable;
- zero-valid-channel import is rejected.

### React/UI tests

- `/iptv` renders the real library panel;
- search and group filtering are deterministic helper functions;
- pagination/incremental rendering works;
- URL refresh is available only for URL-backed lists;
- storage-unavailable state leaves the UnifiedPlayer present.

### Browser acceptance

Use Chrome DevTools against the Docker stack:

1. import a deterministic M3U fixture through paste or file;
2. verify channels/groups/search;
3. play a known-good test HLS/direct channel through the existing UnifiedPlayer;
4. verify the playback path reaches the expected ready/playing state where the public source permits;
5. hard reload and confirm the IPTV list remains;
6. verify URL-backed refresh with a controlled/local HTTP fixture when practical;
7. delete the list and confirm channel rows disappear;
8. verify YouTube live discovery and P3 history/favorites/playlists remain regression-clean;
9. confirm no application console errors.

## Non-goals

- XMLTV download/parsing/guide rendering
- channel metadata editing
- channel drag/drop reorder
- authenticated or server-side IPTV libraries
- cloud synchronization
- generic CORS-bypass proxying
- recording or downloading streams
- torrent streaming
- DRM or geo-restriction bypass

## Exit criteria

- A user can import a valid M3U list by URL, file, or pasted text.
- Imported lists and channels persist across reloads.
- Multiple stored IPTV lists remain isolated.
- Search and group filters operate on stored channels.
- URL-backed lists can be refreshed without destroying valid old data on refresh failure.
- A selected IPTV channel opens in the existing UnifiedPlayer.
- Playing an IPTV channel remains compatible with P3 history/favorites/playlists.
- M3U EPG metadata is preserved without implementing XMLTV in P4.
- IndexedDB/import failures do not disable direct playback.
- No generic backend proxy or authentication dependency is introduced.
- Full verification, Docker acceptance, and browser persistence/playback acceptance pass.
