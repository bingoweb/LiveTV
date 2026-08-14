# P6 XMLTV TV Guide Design

## Goal

Turn `/guide` from a placeholder into a functional TV guide that consumes the EPG metadata already preserved by P4, maps XMLTV schedules onto saved IPTV channels, caches normalized guide data locally, and lets the user play the corresponding channel through the existing UnifiedPlayer.

P6 must remain useful without accounts, server-side personal-library persistence, or a generic arbitrary-URL proxy.

## Product boundary

P6 includes:

- XMLTV fetch from playlist-declared EPG URLs;
- XMLTV and gzip-compressed XMLTV file import for local/fallback use;
- normalized local EPG cache;
- exact and conservative fallback channel matching;
- "now / next" status;
- seven-day programme browsing;
- manual refresh and freshness state;
- channel playback through the existing P4 → UnifiedPlayer path;
- a narrow server fallback for URL-backed IPTV lists when direct browser fetch is blocked by CORS.

P6 does **not** include:

- authentication or user accounts;
- cross-device guide synchronization;
- server-side personal IPTV/EPG libraries;
- a general CORS-bypass proxy;
- recording / DVR;
- catch-up playback;
- programme reminders/notifications;
- watch-progress resume;
- EPG editing;
- automatic channel-logo scraping.

## Why the fallback cannot trust browser IndexedDB

The Fastify API cannot inspect the browser's `livetv-iptv` IndexedDB. Therefore an endpoint that accepts an arbitrary `epgUrl` and merely assumes it came from a saved IPTV list would be a generic URL fetcher in practice.

The server fallback is consequently restricted to **URL-backed IPTV lists** and independently re-verifies the relationship between the playlist and EPG URL.

For a fallback request, the client sends:

```ts
type EpgFallbackRequest = {
  playlistUrl: string
  epgUrl: string
}
```

The API must:

1. validate that both URLs are HTTP(S);
2. apply outbound-network protections before every fetch/redirect;
3. fetch the playlist source URL with a bounded timeout and size limit;
4. extract only the playlist-header EPG URLs (`url-tvg`, `x-tvg-url`, `tvg-url`) using a small shared P4/P6 header parser rather than duplicating the attribute grammar in Fastify;
5. require the requested `epgUrl` to match one of those declared URLs after normal URL resolution;
6. only then fetch and return the XMLTV response;
7. enforce XMLTV timeout and size limits.

No API fallback is available for file/paste IPTV lists because the server cannot independently prove where their EPG URL originated. Those lists still support direct browser fetch when CORS permits and local XMLTV file import when it does not.

## Outbound-network safety boundary

The narrow fallback must not become an SSRF route.

For both playlist and XMLTV fetches:

- allow only `http:` and `https:`;
- reject localhost, loopback, link-local, private, multicast, unspecified, and other non-public literal IPs;
- resolve hostnames server-side and reject the request if any resolved address is non-public;
- follow at most three redirects;
- re-run URL/DNS safety validation for every redirect target;
- use explicit request timeouts;
- cap response size while streaming rather than after an unbounded body read;
- do not forward arbitrary client request headers/cookies;
- do not expose a free-form method/body proxy.

This protection applies even though LiveTV is self-hosted; the endpoint remains intentionally narrow by construction.

### Optional private-host allowlist

Some self-hosted/LAN IPTV providers legitimately expose playlist/EPG endpoints on private addresses. P6 therefore supports an **explicit admin configuration override**:

```text
EPG_FETCH_ALLOWED_PRIVATE_HOSTS=
```

Rules:

- default is empty, so private/non-public targets remain rejected;
- values are comma-separated exact hostnames or literal IPs, trimmed and case-normalized for hostnames;
- only the exact configured host may bypass the public-address check;
- redirects are revalidated independently, so a redirect to a different private host is rejected unless that destination is also explicitly allowlisted;
- protocol, timeout, size, playlist-declaration verification, redirect-count, and header restrictions still apply;
- this setting is server-side only and is never exposed as a Vite/client variable.

This keeps default deployments public-network-only while preserving opt-in LAN functionality for the administrator who controls the LiveTV server.

## Fetch strategy

For a saved IPTV list with one or more `epgUrls`, the client tries sources in list order.

For each source:

1. direct browser fetch first;
2. if direct fetch succeeds, parse locally;
3. if it fails and the IPTV list is URL-backed, call the verified API fallback;
4. if fallback succeeds, parse the returned XMLTV locally;
5. if both fail, keep the last valid local cache and surface a refresh warning instead of deleting it.

For file/paste IPTV lists:

- direct browser fetch is attempted;
- no API fallback is offered;
- a local `.xml` / `.xmltv` file can replace/refresh the EPG cache for that IPTV list.

The guide remains readable from its last successful cache when the upstream is temporarily unavailable.

## Size and timeout limits

P6 uses conservative but practical limits:

- playlist verification body: **10 MiB**, matching the P4 M3U import ceiling;
- XMLTV body: **50 MiB decompressed response text**;
- local XMLTV file: **50 MiB**;
- playlist verification timeout: **12 seconds**;
- XMLTV fetch timeout: **20 seconds**.

The browser and API fallback use the same user-visible oversize semantics.

## Gzip XMLTV

P6 supports both plain XMLTV and gzip-compressed XMLTV because `.xml.gz` feeds are common in IPTV ecosystems.

Detection uses either:

- gzip response/file content type when trustworthy;
- `.gz` path/name hint;
- or the gzip magic bytes `1f 8b`.

Direct browser fetch and local file import use the platform `DecompressionStream('gzip')` when gzip data is detected. If the browser cannot decompress gzip, plain XMLTV remains functional and the UI reports that the compressed source needs a browser with gzip stream support or a plain XMLTV file.

The API fallback normalizes gzip XMLTV to decompressed XML text before returning it. Both paths enforce the **50 MiB decompressed** ceiling while reading/decompressing so a small compressed body cannot expand without bound.

## XML parser

Use `fast-xml-parser` as a direct shared runtime dependency. The parser is pure JavaScript, ESM/browser compatible, and can therefore be used by deterministic tests and the browser without depending on `DOMParser` availability in Vitest/Node.

The normalized parser surface lives in `packages/shared` so the XMLTV grammar and date parsing are not tied to React or Fastify.

The parser must disable automatic numeric conversion for programme/channel identifiers and preserve text identifiers exactly after trimming.

## XMLTV normalized model

Shared parser output:

```ts
type XmltvChannel = {
  id: string
  displayNames: string[]
  iconUrl?: string
}

type XmltvProgramme = {
  channelId: string
  startAt: number
  stopAt: number
  title: string
  subTitle?: string
  description?: string
  categories: string[]
  iconUrl?: string
}

type ParsedXmltv = {
  channels: XmltvChannel[]
  programmes: XmltvProgramme[]
  warnings: XmltvWarning[]
}
```

Malformed individual channels/programmes are non-fatal warnings when valid guide data remains. An XML document that cannot be parsed at all, has no valid channels/programmes, or exceeds limits is a fetch/import failure and must not replace an existing valid cache.

For P6 a usable XMLTV source must contain at least one valid `<channel>` and at least one valid `<programme>`. A syntactically valid but empty `<tv/>` document therefore counts as a failed source rather than a successful empty refresh.

## XMLTV date/time parsing

Support common XMLTV timestamps including:

- `YYYYMMDDhhmmss +ZZZZ`;
- `YYYYMMDDhhmm +ZZZZ`;
- timestamps without an explicit offset.

When an XMLTV timestamp includes an offset, convert it to an absolute Unix millisecond timestamp.

When an offset is omitted, interpret the timestamp as a local wall-clock value in the browser timezone **at that programme date**, not by reusing today's offset. The shared parser accepts an injectable `localWallClockToEpoch(parts)` seam for deterministic tests; the browser default uses the JavaScript local `Date(year, month, day, hour, minute, second)` constructor so DST transitions are resolved for the represented date.

The server fallback returns raw/decompressed XMLTV text and does not parse programme times, ensuring the user's timezone—not the server's—is used for this fallback rule.

Programmes with missing/invalid start times are skipped. A missing or invalid stop time may be inferred from the next programme on the same XMLTV channel when possible; otherwise the programme is kept with a conservative default duration of 30 minutes and a warning.

## Channel matching

Matching is list-specific. P6 must never silently bind one XMLTV channel to multiple IPTV channels using a fuzzy heuristic.

When a playlist declares several EPG sources, matching is evaluated **independently per EPG source** and the matched source-specific XMLTV channels are combined for the IPTV channel. This allows one provider feed to match by exact `tvg-id` while another feed for the same IPTV channel uses its own unique display-name identity. The strongest match reason is kept for UI diagnostics; programme merging still follows persisted source priority.

Priority:

1. **Exact `tvg-id` match**: IPTV `tvgId.trim()` equals XMLTV channel `id.trim()`.
2. **Case-folded `tvg-id` fallback** only when that normalized XMLTV id is unique.
3. If IPTV has no successful id match, compare normalized IPTV `tvgName` and then IPTV `name` with XMLTV `display-name` values.
4. A display-name fallback is accepted only when the normalized name resolves to exactly one XMLTV channel and that XMLTV channel is not already claimed by a stronger match.
5. Otherwise leave the IPTV channel unmatched.

Normalization for fallback names:

- Unicode NFKC;
- locale-aware lowercase where available;
- trim and collapse whitespace;
- remove surrounding punctuation-only differences;
- do **not** remove arbitrary words, numbers, regional suffixes, or HD/4K tokens.

This intentionally prefers an explicit "EPG yok" state over a plausible-but-wrong programme schedule.

## Local persistence

EPG data is disposable/rebuildable cache, so it uses a separate IndexedDB database:

```text
livetv-epg
```

Schema version 1 stores:

### `sources`

One row per cached EPG source for an IPTV list.

```ts
type EpgSourceRecord = {
  sourceKey: string
  listId: string
  sourceType: 'url' | 'file'
  sourceUrl?: string
  position: number
  fetchedAt: number
  channelCount: number
  programmeCount: number
  warningCount: number
}
```

### `channels`

```ts
type EpgChannelRecord = {
  id: string
  sourceKey: string
  xmltvId: string
  displayNames: string[]
  iconUrl?: string
}
```

### `programmes`

```ts
type EpgProgrammeRecord = {
  id: string
  sourceKey: string
  xmltvChannelId: string
  startAt: number
  stopAt: number
  title: string
  subTitle?: string
  description?: string
  categories: string[]
  iconUrl?: string
}
```

Useful indexes:

- `sources.listId`;
- `sources.[listId, position]`;
- `channels.sourceKey`;
- `channels.xmltvId`;
- `programmes.sourceKey`;
- `programmes.xmltvChannelId`;
- `programmes.startAt`;
- compound `[sourceKey, xmltvChannelId, startAt]` if supported cleanly by the existing IndexedDB helper style.

Refresh writes the parsed replacement transactionally. A failed parse/write leaves the prior cache untouched.

Deleting an IPTV list does not need to block on EPG cleanup. P6 exposes `deleteListCache(listId)` and, during Guide initialization, best-effort removes cache rows whose `listId` no longer exists in `livetv-iptv`. This avoids coupling P4 deletion success to the disposable P6 cache while preventing indefinite orphan growth.

## Retention window

The local repository stores only programmes relevant to a practical guide window:

- retain up to **12 hours in the past**;
- retain up to **8 days in the future**.

This supports a seven-day forward UI while keeping enough prior schedule context for currently-running programmes that began before midnight or before the latest refresh.

Rows outside that window are discarded during each successful replacement.

## Freshness and refresh policy

Cached EPG is considered fresh for **6 hours**.

When `/guide` opens or the active IPTV list changes:

- if valid cache exists, render it immediately;
- if cache is older than 6 hours, refresh in the background;
- if there is no cache, start a foreground refresh;
- manual **Yenile** always bypasses the freshness check;
- a failed refresh retains and continues rendering stale cache with a visible warning and last-updated time.

Do not refresh every IPTV list automatically. Only the selected Guide list is refreshed.

While `/guide` is mounted, the controller re-derives clock-sensitive `Şimdi`, `Sıradaki`, and progress state once per minute from the already-cached programme rows. This tick does not trigger network or IndexedDB writes.

When the current combined cache was imported from a local XMLTV file, background freshness refresh does **not** silently switch back to playlist-declared URLs. The UI instead exposes **URL'lerden yenile** when declared EPG URLs exist; that explicit action switches the list back to URL-backed EPG mode. A local file cannot be automatically reread later because LiveTV does not persist a filesystem handle.

## Multiple EPG URLs

A playlist may declare multiple EPG URLs.

P6 processes them in declared order and merges normalized results for the selected IPTV list.

Merge rules:

- XMLTV channel identity is by exact XMLTV `channel id` within each source;
- raw programme duplicates inside the same XMLTV identity are removed by normalized `(xmltv channel id, startAt, stopAt, title)`;
- an earlier declared source wins when duplicate programme identities conflict;
- source-level fetch failures are warnings if at least one other EPG source succeeds;
- if all sources fail, the previous valid combined cache is retained.

After XMLTV channels are mapped to IPTV channels, the derived Guide rows perform a second dedupe by `(iptv channel id, startAt, stopAt, normalized title)`. This prevents two declared EPG feeds that use different XMLTV channel ids for the same IPTV channel from rendering duplicate programmes.

Local XMLTV file import replaces the combined cache for the selected IPTV list as a single file-backed source until the user explicitly chooses **URL'lerden yenile**.

The `sources.position` field persists declared source order so the same precedence remains deterministic after a reload.

## Guide controller boundary

Create a browser-only `GuideController` similar to P3/P4 controller patterns.

Snapshot:

```ts
type GuideSnapshot = {
  status: 'loading' | 'ready' | 'unavailable'
  activeListId: string | null
  selectedDate: string
  channels: GuideChannelRow[]
  unmatchedChannelCount: number
  fetchedAt?: number
  refreshing: boolean
  sourceMode?: 'url' | 'file'
  warningMessage?: string
  errorMessage?: string
}
```

Controller responsibilities:

- use `IptvContext.activeListId` as the selected Guide list and call the existing P4 `selectList()` when the Guide list selector changes, rather than maintaining a second conflicting list selection;
- load cached EPG repository data;
- trigger refresh/import operations;
- match XMLTV channels to P4 `IptvChannel` records;
- derive current/next programmes from a supplied `now()` clock;
- expose date-filtered programme rows;
- never know how media playback is implemented.

The player remains outside the guide controller.

## Guide UI

`/guide` becomes a functional route while preserving the existing overall shell and UnifiedPlayer column.

### Top controls

- IPTV list selector;
- EPG freshness label / last update time;
- **Yenile**;
- **XMLTV dosyası seç** (`.xml`, `.xmltv`, `.xml.gz`, `.xmltv.gz`, `.gz`);
- source/error warning area.

If the selected IPTV list has no EPG URL metadata, the UI explicitly says that no XMLTV URL is declared and offers local XMLTV file import.

### Date navigation

Show:

- **Bugün**;
- the following six calendar days.

This is seven visible guide days. Date labels use the browser locale/timezone.

### Channel rows

Each matched IPTV channel row shows:

- IPTV logo/name;
- currently-running programme with start/end time;
- progress through the current programme when applicable;
- next programme;
- an expandable/scrollable schedule for the selected day;
- **Kanalı oynat**.

Channels without a mapping remain visible with `EPG yok` and still expose **Kanalı oynat**.

Programme clicking itself does not imply catch-up playback. It only selects/expands programme detail. Live playback always opens the IPTV channel's existing stream URL.

### Programme detail

When selected, show available:

- title;
- subtitle;
- start/end;
- description;
- categories;
- programme icon.

No metadata field is required for playback.

## Existing UnifiedPlayer integration

Guide playback reuses the existing `onPlayIptvChannel(channel)` flow already used by `/iptv`.

`GuideWorkspace` receives an `onPlayChannel(IptvChannel)` callback from `RouteContent`; App sends the channel through the existing `playerRequestForIptvChannel()` path.

No new player adapter/controller is introduced.

## Error handling

User-visible states include:

- no IPTV lists imported;
- selected list has no EPG references;
- direct XMLTV fetch blocked/failed;
- verified server fallback unavailable/failed;
- local XMLTV file too large;
- XML invalid / no usable programme records;
- partial source failure when another XMLTV source still worked;
- stale cache shown because refresh failed;
- IndexedDB guide cache unavailable;
- unmatched IPTV channels.

Guide failure must never disable IPTV/manual playback.

## API surface

Add one narrow endpoint:

```text
POST /api/epg/fetch
```

Request:

```json
{
  "playlistUrl": "https://provider.example/list.m3u",
  "epgUrl": "https://provider.example/guide.xml"
}
```

Success returns XMLTV text with an XML content type. The endpoint does not accept arbitrary headers, methods, bodies, credentials, or a standalone EPG URL without playlist verification.

Expected structured error codes include:

- `invalid_epg_request`;
- `unsafe_epg_url`;
- `playlist_fetch_failed`;
- `epg_not_declared_by_playlist`;
- `epg_fetch_failed`;
- `epg_response_too_large`.

## Testing

### Shared XMLTV parser tests

- channels/display names/icons;
- programme title/subtitle/description/categories;
- XMLTV timestamps with offsets;
- no-offset timestamps with an injected deterministic local-wall-clock resolver;
- inferred/default stop time;
- malformed records as warnings;
- identifiers preserved as strings;
- duplicate programme normalization.

### Compression tests

- plain XML remains unchanged;
- gzip magic-byte detection;
- gzip decompression success;
- decompressed-size limit;
- unsupported browser decompressor produces a guide-only error;
- API fallback gzip normalization.

### Channel-matching tests

- exact `tvg-id` wins;
- case-fold fallback only when unique;
- unique display-name fallback;
- ambiguous display name remains unmatched;
- one XMLTV channel cannot be silently claimed by multiple weak matches.

### EPG repository tests

- transactional source replacement;
- failed replacement preserves previous cache;
- 12-hour past / 8-day future retention;
- source merge/deduplication;
- list-cache cleanup;
- malformed stored rows ignored defensively.

### Fetch-service tests

- direct browser fetch success;
- direct failure → URL-list API fallback;
- file/paste list never calls API fallback;
- local XMLTV file import;
- size and timeout handling;
- stale cache preserved after refresh failure.

### API fallback tests

- P4 browser parser and P6 API verification share the same M3U header EPG-URL extraction helper;
- EPG URL must be declared by the independently fetched M3U header;
- playlist-declared relative EPG URL resolves against playlist URL;
- undeclared EPG rejected;
- private/loopback literal IP rejected;
- DNS-resolved non-public address rejected;
- exact admin private-host allowlist permits only the configured hostname/IP and does not disable other network checks;
- redirect target revalidated;
- redirect count limit;
- playlist/XMLTV body limits;
- timeout/error mapping;
- no arbitrary request-header forwarding.

### React/controller tests

- no-list empty state;
- no-EPG metadata state;
- cached guide renders before background refresh;
- stale warning preserves rows;
- seven date buttons;
- now/next calculation;
- unmatched channel remains playable;
- channel play callback uses the P4 channel object.

### Browser acceptance

Use a deterministic local M3U/XMLTV fixture plus one real CORS-capable or local HTTP fixture:

1. import/select an IPTV list with EPG metadata;
2. open `/guide` and load XMLTV;
3. verify current/next and seven-day rows;
4. verify hard-navigation persistence from `livetv-epg`;
5. verify channel playback reaches existing UnifiedPlayer;
6. simulate direct-fetch failure and verify URL-backed API fallback;
7. verify failed refresh retains previous guide;
8. verify local XMLTV file import for a file/paste IPTV list;
9. verify YouTube/IPTV/Torrent/P3 regressions and clean application console.

## Dependency policy

`fast-xml-parser` must pass the repository direct-dependency license policy and Dependency Review. Do not add a large XML/DOM framework or server proxy dependency merely for P6.

## Exit criteria

- `/guide` is functional rather than placeholder content.
- Saved IPTV lists expose their XMLTV guide data when available.
- Direct browser XMLTV fetch is preferred.
- URL-backed lists have a verified, SSRF-constrained API fallback.
- File/paste lists can use direct CORS fetch or local XMLTV file import without a generic server proxy.
- XMLTV schedules persist in `livetv-epg` and survive reloads.
- Existing valid cache survives upstream/parse/write failures.
- Channel matching is explicit and ambiguity-safe.
- Current, next, and seven-day schedules render.
- Unmatched channels remain visible and playable.
- Guide playback reuses the P4/UnifiedPlayer path.
- P2/P3/P4/P5 regressions remain clean.
- Full local verification, Docker acceptance, browser acceptance, GitHub CI, merge, and final-main verification pass.
