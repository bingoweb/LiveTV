# P5 Browser WebTorrent Streaming Design

## Goal

Add browser-native WebTorrent streaming to LiveTV without introducing a server-side torrent fallback or a second media player. Users can open a magnet URI or local `.torrent` file, inspect the torrent's files, choose a browser-playable audio/video file, and stream it through the existing UnifiedPlayer.

## Protocol reality and product boundary

Browser WebTorrent uses WebRTC transport. It cannot directly connect to ordinary BitTorrent peers that only expose TCP/uTP/UDP transports. A torrent therefore needs WebRTC-capable peers and/or browser-accessible web seeds to work reliably in LiveTV.

P5 must surface that limitation instead of silently falling back to a server torrent engine.

WebTorrent participates in the peer-to-peer swarm while a torrent is active, including uploads to peers as the protocol requires. P5 does not add a permanent seeding mode, background daemon, server seeder, or user-facing torrent creation/seeding feature.

## Runtime dependency

Use the current WebTorrent 3.x browser package as a web-app runtime dependency. The WebTorrent runtime must be dynamically imported only when the torrent feature is initialized so the normal LiveTV startup bundle is not forced to pay the full P2P client cost.

The implementation should prefer the browser-ready WebTorrent distribution exposed by the package if normal Vite bundling requires Node polyfill configuration. Do not add broad Node polyfill stacks merely to bundle a browser torrent client.

## Service-worker architecture

LiveTV already owns `/sw.js` at root scope for PWA shell/static caching. P5 must not replace or merge generated WebTorrent code into that worker.

Instead:

- the existing LiveTV PWA worker stays at scope `/`;
- the official WebTorrent worker is served at `/webtorrent/sw.js`;
- that worker is registered with the narrower scope `/webtorrent/`;
- WebTorrent `client.createServer({ controller: registration })` uses that registration;
- selected torrent files receive same-origin `/webtorrent/...` streaming URLs;
- requests under `/webtorrent/` are therefore handled by the more-specific WebTorrent worker rather than the LiveTV shell worker.

The official worker source must come from the installed `webtorrent` package, not a CDN. Vite development/build plumbing may serve and emit that package worker at the stable `/webtorrent/sw.js` URL so the repository does not carry a silently stale copied minified worker.

The build must include a regression test that the emitted/served worker plumbing exists and that the root PWA worker remains unchanged in its media-cache boundary.

## Torrent inputs

P5 supports:

1. magnet URI pasted into the Torrent workspace;
2. local `.torrent` file read as `Uint8Array`;
3. HTTP(S) URL to a `.torrent` file when the browser/WebTorrent runtime can fetch it.

The textual input accepts magnet or HTTP(S) only. No filesystem path, `file:` URL, arbitrary custom scheme, or anonymous backend fetch/proxy is introduced.

Local `.torrent` metadata files are limited to **5 MiB** before being handed to WebTorrent.

## Session architecture

P5 maintains at most **one active torrent session**.

`TorrentController` owns the lazy WebTorrent runtime and exposes a snapshot to React:

```ts
type TorrentSessionStatus =
  'idle' | 'initializing' | 'metadata' | 'ready' | 'streaming' | 'error'

type TorrentFileDescriptor = {
  path: string
  name: string
  size: number
  type: string
  mediaType: 'video' | 'audio' | 'unsupported'
  streamUrl?: string
}

type TorrentSnapshot = {
  status: TorrentSessionStatus
  supported: boolean | null
  torrentName?: string
  infoHash?: string
  magnetUri?: string
  files: TorrentFileDescriptor[]
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
```

Controller operations:

```ts
initialize(): Promise<void>
openTextSource(input: string, preferredFilePath?: string): Promise<void>
openTorrentFile(file: File, preferredFilePath?: string): Promise<void>
selectFile(path: string): Promise<TorrentPlaybackDescriptor>
stop(): Promise<void>
destroy(): Promise<void>
```

Opening a new torrent first stops/destroys the previous torrent and its store.

## Runtime initialization

Initialization:

1. verify `navigator.serviceWorker` support;
2. dynamically import WebTorrent;
3. verify `WebTorrent.WEBRTC_SUPPORT`;
4. register `/webtorrent/sw.js` with scope `/webtorrent/`;
5. wait for that specific registration's active worker rather than relying on root-scope `navigator.serviceWorker.ready`;
6. create one WebTorrent client;
7. always attach a client-level `error` listener;
8. call `client.createServer({ controller: registration })` once.

If WebRTC or service workers are unavailable, only torrent streaming becomes unavailable; direct/HLS/YouTube/IPTV playback remains functional.

## Torrent lifecycle and cleanup

When adding a torrent:

- use `deselect: true` so files are not all eagerly prioritized;
- use `destroyStoreOnDestroy: true`;
- attach torrent-level `error`, `warning`, `noPeers`, `download`, `upload`, `done`, and metadata/ready listeners before depending on them;
- poll/display aggregate stats at a modest cadence such as 1 second, not on every downloaded chunk;
- do not expose a download/save button;
- do not retain a permanent torrent archive.

`stop()` removes the torrent with `destroyStore: true`, clears the session snapshot, and closes the WebTorrent stream selection. `destroy()` additionally destroys the WebTorrent client/server. Best-effort cleanup also runs on page unload.

P5 does not promise that browser storage is cryptographically erased; it requests WebTorrent store destruction and avoids an intentional persistent archive.

## Metadata and peer waiting

Magnet metadata may take time to arrive. UI states distinguish:

- runtime initialization;
- metadata/peer discovery;
- metadata ready with file list;
- streaming.

The controller listens for `noPeers` and surfaces a message explaining that browser WebTorrent needs WebRTC-compatible peers or web seeds. `noPeers` is advisory, not fatal; later peer discovery can clear the warning.

Fatal torrent errors end only the active torrent session and do not destroy the whole LiveTV application.

## File selection

After metadata is ready, list all files but allow playback only for browser media candidates.

Supported candidate extensions for P5:

### Video

`mp4`, `m4v`, `mov`, `webm`, `ogv`, `ogg`, `mkv`

### Audio

`mp3`, `m4a`, `aac`, `wav`, `flac`, `opus`, `oga`, `ogg`

Container/codec support still depends on the browser. UI therefore says "browser-playable candidate" rather than promising every listed file will decode.

Selection rules:

- unsupported files remain visible but their Play action is disabled;
- if `preferredFilePath` from History/Favorites exists and is playable, choose it;
- otherwise if exactly one playable file exists, it may be automatically selected/prepared;
- otherwise the user explicitly chooses a file;
- selecting a file deselects other files where practical and selects/prioritizes the chosen file.

`file.streamURL` becomes available through the dedicated WebTorrent service worker/server.

## Existing UnifiedPlayer handoff

Torrent data transport and media playback stay separate:

1. TorrentController resolves metadata and chosen file.
2. It returns:

```ts
type TorrentPlaybackDescriptor = {
  streamUrl: string
  preference: 'direct-video' | 'direct-audio'
  title: string
  librarySource: TorrentLibrarySource
}
```

3. App converts that descriptor to the existing `PlayerOpenRequest`.
4. UnifiedPlayer loads the `/webtorrent/...` URL through the existing direct-media adapter/Plyr surface.

No second `<video>` player or torrent-specific player controls are introduced.

## P3 History / Favorites / Playlists integration

The transient `/webtorrent/...` stream URL is not a valid persistent identity. P5 extends `LibrarySource` with a torrent variant:

```ts
type TorrentLibrarySource = {
  sourceKey: string
  kind: 'torrent'
  url: string // canonical magnet URI
  title: string // selected file display title
  torrentFilePath: string
  torrentMediaType: 'video' | 'audio'
  thumbnailUrl?: string
}
```

`sourceKey` is derived from `infoHash + torrentFilePath`, not the temporary stream URL.

When UnifiedPlayer reaches real `playing`, `PlayerOpenRequest` may provide `librarySourceOverride`; P3 records/favorites/playlist actions use that stable torrent source instead of deriving identity from `/webtorrent/...`.

History/Playlist replay behavior:

1. App sees `source.kind === 'torrent'`.
2. It navigates to `/torrent`.
3. It sends a torrent replay request containing canonical magnet URI + preferred file path.
4. TorrentController reopens the torrent and selects that file when metadata arrives.
5. The resulting stream URL returns to the same UnifiedPlayer.

If the swarm is no longer available, History still retains the reference but playback reports the normal WebTorrent peer/metadata error.

## Generic source-classifier boundary

The generic UnifiedPlayer URL classifier must not treat a magnet URI as direct media. Its current "requires P5" wording becomes a current instruction such as:

> Magnet bağlantısını Torrent panelinden aç.

The dedicated torrent workspace owns magnet metadata/file selection.

## Torrent workspace UI

`/torrent` becomes functional and replaces its placeholder context panel.

### Source controls

- magnet / `.torrent` HTTP(S) URL text input;
- **Torrent’i aç**;
- local `.torrent` file picker;
- **Durdur ve temizle** when a session exists.

### Capability disclosure

Always show a compact note:

- browser WebTorrent uses WebRTC;
- desktop-only BitTorrent peers may be invisible;
- active P2P sessions can upload pieces to peers;
- LiveTV does not keep a permanent torrent archive after Stop/cleanup.

### Session status

- torrent name / info hash (compact);
- peer count;
- progress;
- download/upload speed;
- downloaded/uploaded totals;
- estimated remaining time where meaningful;
- no-peers warning;
- runtime/torrent error state.

### File browser

- file name/path;
- size;
- detected media type;
- file progress if available;
- **Oynat** for supported media candidate files;
- unsupported files are visible but disabled.

## PWA behavior

The root LiveTV service worker must continue to avoid caching media/API/torrent payloads. The dedicated `/webtorrent/` worker exists solely to provide WebTorrent's range/stream bridge and must not be added to the PWA shell cache.

WebTorrent stream URLs are never stored for offline playback.

## Testing

### Pure helper tests

- text source validation for magnet and HTTP(S) `.torrent` URL;
- 5 MiB local file limit;
- file media-type classification;
- preferred-file selection;
- stable torrent library source identity;
- human-readable stats formatting.

### Controller tests

Use a fake WebTorrent runtime seam rather than live peers for deterministic tests:

- unsupported WebRTC/service-worker state;
- initialization registers `/webtorrent/sw.js` with `/webtorrent/` scope;
- adding magnet/file;
- metadata snapshot;
- noPeers advisory behavior;
- file selection yields correct stream URL/direct preference;
- opening a new torrent cleans the old store;
- stop/destroy cleanup;
- torrent fatal error isolates to session;
- preferred replay file is selected when available.

### P3 integration tests

- torrent library sources validate/persist in History/Favorites/Playlists;
- stable identity is infoHash + file path;
- normal P2/P3/P4 source behavior remains unchanged;
- torrent History replay routes back through TorrentController rather than trying to open the old stream URL.

### Build/service-worker tests

- `webtorrent` is a direct approved-license dependency;
- Vite can serve/emit `/webtorrent/sw.js` from the installed package;
- root `/sw.js` cache rules still exclude media;
- production build succeeds with WebTorrent dynamically split from initial application code.

### Browser acceptance

Use the Creative Commons Sintel WebTorrent sample from the WebTorrent project's own documentation when the public swarm/web seed is available:

1. open `/torrent`;
2. add the documented Sintel magnet URI;
3. wait for metadata/file list;
4. select the MP4 media file;
5. verify the existing UnifiedPlayer loads a `/webtorrent/...` stream URL and reaches ready/playing;
6. verify peer/progress stats update where the environment allows;
7. add the source to Favorite/History and verify the stored identity is magnet + file path rather than stream URL;
8. replay from History and verify the torrent route/session is rebuilt;
9. Stop and verify session state clears;
10. verify YouTube/IPTV/P3 regressions and application console cleanliness.

Public swarm availability is an external dependency, so deterministic automated tests must not depend on it. If live peers/web seeds are temporarily unavailable, browser acceptance records the external limitation while controller/service-worker/unit behavior still must pass.

## Non-goals

- server-side WebTorrent or `webtorrent-hybrid` fallback;
- normal TCP/UDP peer bridge;
- permanent torrent downloads/archive;
- explicit seeding/upload management UI;
- torrent creation;
- recording;
- transcoding unsupported codecs;
- DRM or geo-restriction bypass;
- authentication or cross-device torrent sync.

## Exit criteria

- Magnet URI and local `.torrent` input initialize Browser WebTorrent.
- HTTP(S) `.torrent` URL is accepted without a server proxy.
- Dedicated `/webtorrent/` service worker coexists with the LiveTV root PWA worker.
- Torrent metadata/files/status are visible in `/torrent`.
- Supported torrent media files stream through the existing UnifiedPlayer.
- Only one active torrent session exists and Stop destroys its store best-effort.
- Browser WebRTC peer limitations and active P2P upload behavior are disclosed.
- Torrent History/Favorites/Playlists use stable magnet + file identity and replay through the torrent route.
- Direct/HLS/YouTube/IPTV behavior remains regression-clean.
- No server torrent fallback, permanent archive, torrent creation, recording, or transcoding is introduced.
- Full verification, Docker acceptance, browser acceptance, GitHub CI, merge, and final-main verification pass.
