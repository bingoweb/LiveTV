# P6 XMLTV TV Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/guide` into a persistent seven-day XMLTV guide that maps schedules to saved IPTV channels, prefers direct browser fetch, uses a verified SSRF-constrained API fallback for URL-backed lists, and reuses the existing UnifiedPlayer for channel playback.

**Architecture:** XMLTV parsing and M3U EPG-header extraction live in `@livetv/shared`; the web app owns browser fetch/decompression, `livetv-epg` IndexedDB cache, channel matching, and Guide UI; Fastify exposes only one narrow `/api/epg/fetch` endpoint that independently verifies the EPG URL is declared by the supplied playlist URL before fetching it. Guide data is disposable local cache, while P4 IPTV lists remain the source of truth for list/channel identity.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Fastify 5, native IndexedDB, native browser `DecompressionStream`, Node `http`/`https`/`dns`/`zlib`, `fast-xml-parser` 5.x, Vitest, existing P4 IPTV controller, existing UnifiedPlayer.

## Global Constraints

- No authentication, server-side personal EPG library, cross-device sync, DVR/catch-up, recording, reminders, watch-progress resume, or generic CORS-bypass proxy.
- Direct browser XMLTV fetch is always attempted before API fallback.
- API fallback is available only for URL-backed IPTV lists and must independently re-fetch the playlist and verify that the requested EPG URL is declared in its M3U header.
- API outbound requests allow only HTTP(S), validate every DNS target/redirect, reject non-public addresses, use explicit timeouts, and enforce streaming body limits.
- `EPG_FETCH_ALLOWED_PRIVATE_HOSTS` is an optional server-only comma-separated exact-host override; default empty. It may permit an explicitly configured LAN/private target but must not disable URL, declaration, redirect, timeout, or size validation.
- P4 M3U verification body limit: 10 MiB.
- XMLTV decompressed body/file limit: 50 MiB.
- Playlist verification timeout: 12 seconds.
- XMLTV timeout: 20 seconds.
- EPG cache freshness: 6 hours.
- Programme retention: 12 hours past to 8 days future.
- Guide UI shows today plus the following six calendar days.
- Local XMLTV file mode is not silently overwritten by background URL refresh.
- One ambiguous/fuzzy XMLTV match must never silently attach the wrong guide to an IPTV channel.
- Guide playback must reuse the existing `playerRequestForIptvChannel()` / UnifiedPlayer path.
- P2/P3/P4/P5 regressions must remain clean.

---

### Task 1: Shared M3U EPG header extraction and XMLTV parser

**Files:**

- Modify: `packages/shared/package.json`
- Modify: `package-lock.json`
- Create: `packages/shared/src/m3u-epg.ts`
- Create: `packages/shared/src/xmltv.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/test/m3u-epg.test.ts`
- Create: `packages/shared/test/xmltv.test.ts`
- Modify: `apps/web/src/iptv/m3u-parser.ts`
- Modify: `apps/web/src/iptv/m3u-parser.test.ts`

**Interfaces:**

```ts
export type LocalWallClockParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export type XmltvChannel = {
  id: string
  displayNames: string[]
  iconUrl?: string
}

export type XmltvProgramme = {
  channelId: string
  startAt: number
  stopAt: number
  title: string
  subTitle?: string
  description?: string
  categories: string[]
  iconUrl?: string
}

export type XmltvWarning = {
  code:
    'invalid-channel' | 'invalid-programme' | 'inferred-stop' | 'default-stop'
  message: string
}

export type ParsedXmltv = {
  channels: XmltvChannel[]
  programmes: XmltvProgramme[]
  warnings: XmltvWarning[]
}

export function extractM3uEpgUrls(text: string, baseUrl?: string): string[]

export function parseXmltv(
  xml: string,
  options?: {
    localWallClockToEpoch?: (parts: LocalWallClockParts) => number
  },
): ParsedXmltv
```

- [x] **Step 1: Add parser dependency RED/lock intent.** `fast-xml-parser@5.10.1` was added only to `@livetv/shared` plus the root lockfile; no second XML library was introduced.

- [x] **Step 2: Write `m3u-epg.test.ts` RED tests** covering declared EPG attributes, order/deduplication, relative resolution, malformed/unsupported values, and first-header-only behavior.

```ts
expect(
  extractM3uEpgUrls(
    '#EXTM3U url-tvg="guide.xml, https://epg.example/second.xml"',
    'https://iptv.example/list/main.m3u',
  ),
).toEqual([
  'https://iptv.example/list/guide.xml',
  'https://epg.example/second.xml',
])
```

- [x] **Step 3: Run the shared M3U test**; RED was confirmed because `../src/m3u-epg` did not exist.

- [x] **Step 4: Implement `extractM3uEpgUrls()`** as the pure shared header parser with HTTP(S), base-URL resolution, order preservation, and deduplication.

- [x] **Step 5: Refactor P4 `m3u-parser.ts`** so playlist-level EPG extraction delegates to the shared helper; all six existing P4 parser tests remain green.

- [x] **Step 6: Write XMLTV RED tests** covering channel/programme metadata, offset/local timestamps, string ids, warnings, stop inference/defaulting, and duplicate removal.

```ts
const parsed = parseXmltv(xml, {
  localWallClockToEpoch: ({ year, month, day, hour, minute, second }) =>
    Date.UTC(year, month - 1, day, hour, minute, second),
})

expect(parsed.channels[0]?.id).toBe('001')
expect(parsed.programmes[0]).toMatchObject({
  channelId: '001',
  title: 'Morning News',
})
```

- [x] **Step 7: Run XMLTV tests**; RED was confirmed because `../src/xmltv` did not exist.

- [x] **Step 8: Implement `parseXmltv()`** with string-preserving `fast-xml-parser`, normalized singleton/array nodes, date parsing, stop inference/defaulting, warnings, sort, and exact programme dedupe.

- [x] **Step 9: Export shared helpers** and verify shared/P4 tests plus shared/web typecheck. Evidence: 14/14 focused tests pass; shared/web typecheck exits 0. `packages/shared` now declares `DOM` in its lib set because the shared URL parser targets both browser and Node runtimes.

- [x] **Step 10: Run `npm run licenses:check`**. Evidence: `fast-xml-parser@5.10.1 — MIT`; license policy passes 21 direct dependencies and `npm install` reported no current vulnerabilities in the updated graph.

- [ ] **Step 11: Commit** with `feat: add shared XMLTV parsing`.

---

### Task 2: Narrow verified API fallback with outbound-network protections

**Files:**

- Create: `apps/api/src/public-http-text.ts`
- Create: `apps/api/src/epg-fallback.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `.env.example`
- Modify: `compose.yaml`
- Create: `apps/api/test/public-http-text.test.ts`
- Create: `apps/api/test/epg-fallback.test.ts`
- Modify: `apps/api/test/health.test.ts` only if app-construction test helpers need options.

**Interfaces:**

```ts
export type PublicHttpTextOptions = {
  maxBytes: number
  timeoutMs: number
  maxRedirects?: number
  acceptGzip?: boolean
  allowedPrivateHosts?: ReadonlySet<string>
  lookupImpl?: typeof import('node:dns/promises').lookup
}

export type PublicHttpTextResult = {
  finalUrl: string
  text: string
  contentType?: string
}

export async function fetchPublicHttpText(
  input: string,
  options: PublicHttpTextOptions,
): Promise<PublicHttpTextResult>

export type FetchVerifiedEpgInput = {
  playlistUrl: string
  epgUrl: string
}

export type EpgFallbackErrorCode =
  | 'invalid_epg_request'
  | 'unsafe_epg_url'
  | 'playlist_fetch_failed'
  | 'epg_not_declared_by_playlist'
  | 'epg_fetch_failed'
  | 'epg_response_too_large'

export class EpgFallbackError extends Error {
  constructor(
    public readonly code: EpgFallbackErrorCode,
    public readonly statusCode: 400 | 502,
    message: string,
    options?: ErrorOptions,
  )
}

export async function fetchVerifiedEpg(
  input: FetchVerifiedEpgInput,
  deps?: {
    fetchText?: typeof fetchPublicHttpText
    allowedPrivateHosts?: ReadonlySet<string>
  },
): Promise<{ xml: string; epgUrl: string }>
```

- [ ] **Step 1: Write `public-http-text` RED tests** using injectable DNS resolution and a deterministic local HTTP fixture/server seam. Cover invalid protocol, loopback/private IPv4, loopback/ULA/link-local IPv6, DNS answers containing any non-public address, allowed public address, an exact `allowedPrivateHosts` match permitting only that configured host, redirect revalidation including a redirect to a different non-allowlisted private host, redirect limit, timeout, body-size overflow, gzip body normalization, and no arbitrary cookie/header forwarding.

- [ ] **Step 2: Run** `npx vitest run apps/api/test/public-http-text.test.ts`; confirm RED because the module does not exist.

- [ ] **Step 3: Implement public-address validation** without a broad proxy dependency. Use `node:net` for literal IP detection, explicit IPv4/IPv6 private/reserved range checks, and `dns/promises.lookup(host, { all: true, verbatim: true })`. Reject a hostname if any returned address is non-public.

- [ ] **Step 4: Implement `fetchPublicHttpText()`** with `node:http`/`node:https.request`, a custom validated DNS `lookup` callback so the actual socket uses a validated address, at most three manual redirects, timeout/abort handling, streaming byte limits, and gzip decode through `node:zlib.createGunzip()` when the response body is actually gzip-compressed. Preserve hostname/SNI by requesting the original URL hostname rather than replacing the URL with the resolved IP.

- [ ] **Step 5: Re-run public-http tests** and confirm GREEN before adding the EPG endpoint.

- [ ] **Step 6: Write `epg-fallback` RED tests** proving the API independently fetches the playlist URL with 10 MiB / 12 s limits, extracts EPG URLs with shared `extractM3uEpgUrls()`, resolves relative declarations, rejects an undeclared requested EPG URL, and fetches an approved EPG with 50 MiB / 20 s limits.

```ts
await expect(
  fetchVerifiedEpg(
    {
      playlistUrl: 'https://provider.example/list.m3u',
      epgUrl: 'https://attacker.example/internal.xml',
    },
    { fetchText },
  ),
).rejects.toThrow('ilan edilmiyor')
```

- [ ] **Step 7: Implement `fetchVerifiedEpg()`** so there is no code path that fetches `epgUrl` before playlist declaration verification succeeds. Translate lower-level URL/network/size failures into typed `EpgFallbackError` values; route code must branch on `error.code`/`statusCode`, never Turkish message substrings.

- [ ] **Step 8: Write Fastify route RED tests** for `POST /api/epg/fetch`: missing/invalid body → `400 invalid_epg_request`; unsafe network target → `400 unsafe_epg_url`; playlist fetch error → `502 playlist_fetch_failed`; undeclared URL → `400 epg_not_declared_by_playlist`; XMLTV fetch/size failure → `502` with the appropriate structured code; success → XML text and XML content type.

- [ ] **Step 9: Add injectable `epgFetcher` to `buildApi()` options** for deterministic route tests and register exactly one POST endpoint. Parse `EPG_FETCH_ALLOWED_PRIVATE_HOSTS` once at API construction into an exact-host set passed to the fetch layer. Do not add wildcard paths, custom target headers, arbitrary methods, or user-provided request bodies forwarded upstream.

- [ ] **Step 10: Wire server-only environment configuration.** Add blank `EPG_FETCH_ALLOWED_PRIVATE_HOSTS=` to `.env.example`; pass it only to the API service in `compose.yaml`. Add/extend a compose regression test proving the web service does not receive it and that no `VITE_*` EPG private-host variable exists.

- [ ] **Step 11: Run API tests and API typecheck** with `npx vitest run apps/api/test/public-http-text.test.ts apps/api/test/epg-fallback.test.ts apps/api/test/youtube-live.test.ts tests/postgres-compose.test.ts` and `npm run typecheck -w @livetv/api`; confirm YouTube resolver behavior remains green.

- [ ] **Step 12: Commit** with `feat: add verified XMLTV fallback endpoint`.

---

### Task 3: `livetv-epg` IndexedDB repository, retention, merge, and channel matching

**Files:**

- Create: `apps/web/src/guide/guide-types.ts`
- Create: `apps/web/src/guide/epg-db.ts`
- Create: `apps/web/src/guide/epg-repository.ts`
- Create: `apps/web/src/guide/epg-repository.test.ts`
- Create: `apps/web/src/guide/channel-matcher.ts`
- Create: `apps/web/src/guide/channel-matcher.test.ts`
- Create: `apps/web/src/guide/guide-derivation.ts`
- Create: `apps/web/src/guide/guide-derivation.test.ts`

**Interfaces:**

```ts
export const EPG_DATABASE_NAME = 'livetv-epg'
export const EPG_DATABASE_VERSION = 1
export const EPG_FRESH_MS = 6 * 60 * 60 * 1000
export const EPG_PAST_MS = 12 * 60 * 60 * 1000
export const EPG_FUTURE_MS = 8 * 24 * 60 * 60 * 1000

export type EpgSourceRecord = {
  sourceKey: string
  listId: string
  sourceType: 'url' | 'file'
  sourceUrl?: string
  fetchedAt: number
  channelCount: number
  programmeCount: number
  warningCount: number
}

export interface EpgRepository {
  replaceListSources(input: {
    listId: string
    sources: Array<{
      source: EpgSourceRecord
      channels: XmltvChannel[]
      programmes: XmltvProgramme[]
    }>
    now: number
  }): Promise<void>
  readListCache(listId: string): Promise<{
    sources: EpgSourceRecord[]
    channels: EpgChannelRecord[]
    programmes: EpgProgrammeRecord[]
  }>
  deleteListCache(listId: string): Promise<void>
  removeOrphanLists(validListIds: readonly string[]): Promise<void>
}
```

- [ ] **Step 1: Write repository RED tests** with `fake-indexeddb` proving database/store/index creation, transactional multi-source replacement, replacement rollback on an injected write failure, 12-hour/8-day retention filtering, readback, file-vs-url source metadata, list-cache deletion, orphan cleanup, and malformed stored rows being skipped rather than crashing the whole guide.

- [ ] **Step 2: Run** `npx vitest run apps/web/src/guide/epg-repository.test.ts`; confirm RED.

- [ ] **Step 3: Implement `epg-db.ts` and repository** with `sources`, `channels`, and `programmes` object stores. Use deterministic ids derived from source/list/xmltv identity; keep each refresh replacement inside one readwrite transaction and apply the retention window before writes.

- [ ] **Step 4: Write channel matcher RED tests** for exact id, unique case-folded id, unique `tvgName` fallback, IPTV `name` fallback, ambiguity rejection, weak-match claim collision, and unmatched output. Include punctuation/whitespace normalization without stripping `HD`, `4K`, numbers, or regional words.

- [ ] **Step 5: Implement `matchIptvChannelsToXmltv()`** returning one row per P4 IPTV channel with either a matched XMLTV id/match reason or `null`. Strong exact matches may legitimately share schedules only when the IPTV records themselves carry the same explicit `tvgId`; weak fallback may not silently claim an XMLTV channel twice.

```ts
export type ChannelGuideMatch = {
  channel: IptvChannel
  xmltvId: string | null
  match: 'exact-id' | 'folded-id' | 'display-name' | 'none'
}
```

- [ ] **Step 6: Write guide derivation RED tests** for current programme, next programme, programme progress, selected-day filtering in local timezone, source-order programme merge, second-stage dedupe by `(iptv channel id,startAt,stopAt,title)`, and unmatched channels remaining in output.

- [ ] **Step 7: Implement pure `deriveGuideRows()`** with injected `now` and local date-key helpers. It consumes P4 IPTV channels plus cached XMLTV records and produces UI-ready rows; it must not call IndexedDB or player code.

- [ ] **Step 8: Run repository/matcher/derivation tests and web typecheck**; confirm GREEN.

- [ ] **Step 9: Commit** with `feat: add persistent EPG guide cache`.

---

### Task 4: Browser XMLTV fetch, gzip decode, source merge, and local-file import

**Files:**

- Create: `apps/web/src/guide/xmltv-payload.ts`
- Create: `apps/web/src/guide/xmltv-payload.test.ts`
- Create: `apps/web/src/guide/epg-fetch-service.ts`
- Create: `apps/web/src/guide/epg-fetch-service.test.ts`

**Interfaces:**

```ts
export const XMLTV_MAX_BYTES = 50 * 1024 * 1024

export async function decodeXmltvBytes(
  bytes: Uint8Array,
  options?: {
    maxBytes?: number
    decompressionStreamFactory?: (
      format: 'gzip',
    ) => TransformStream<Uint8Array, Uint8Array>
  },
): Promise<string>

export type EpgFetchResult = {
  mode: 'url' | 'file'
  sources: Array<{
    sourceUrl?: string
    parsed: ParsedXmltv
  }>
  warnings: string[]
}

export async function fetchGuideFromUrls(input: {
  list: IptvList
  fetchImpl?: typeof fetch
  apiFetchImpl?: typeof fetch
  now?: () => number
}): Promise<EpgFetchResult>

export async function importGuideFile(file: File): Promise<EpgFetchResult>
```

- [ ] **Step 1: Write payload RED tests** for UTF-8 plain XML, gzip magic detection, gzip success through an injected decompressor seam, decompressed >50 MiB rejection without constructing an unbounded final string, invalid UTF-8 replacement semantics, and a clear unsupported-gzip error when no decompressor exists.

- [ ] **Step 2: Run payload tests** and confirm RED.

- [ ] **Step 3: Implement payload decoding** using chunked `ReadableStream`/`DecompressionStream` when gzip magic is present and `TextDecoder` for UTF-8. Browser fetches that have already been content-decoded should be treated as plain XML because the gzip magic is absent even if the URL ends in `.gz`.

- [ ] **Step 4: Write fetch-service RED tests** proving declared EPG URLs are attempted in order, direct browser fetch wins when successful, direct failure on URL-backed list calls `/api/epg/fetch`, file/paste list never uses API fallback, one source failure is a warning when another source succeeds, all-source failure rejects, and XML parser warnings are accumulated.

- [ ] **Step 5: Implement direct/fallback URL fetch** with 20-second browser timeout and bounded response reads. POST fallback body must contain only `{ playlistUrl, epgUrl }`; it must never send cookies/credentials explicitly.

- [ ] **Step 6: Write local-file RED tests** for `.xml`, `.xmltv`, and gzip payloads, 50 MiB limit, and filename-independent magic detection.

- [ ] **Step 7: Implement `importGuideFile()`** returning one file-backed parsed source. Do not persist File handles or raw XML after parsing.

- [ ] **Step 8: Run fetch/payload tests and web typecheck**; confirm GREEN.

- [ ] **Step 9: Commit** with `feat: add XMLTV fetch and import service`.

---

### Task 5: Guide controller/provider with cache-first freshness semantics

**Files:**

- Create: `apps/web/src/guide/guide-controller.ts`
- Create: `apps/web/src/guide/guide-controller.test.ts`
- Create: `apps/web/src/guide/guide-context.tsx`
- Create: `apps/web/src/guide/guide-context.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**

```ts
export type GuideSnapshot = {
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

export class GuideController {
  getSnapshot(): GuideSnapshot
  subscribe(listener: () => void): () => void
  initialize(input: {
    lists: readonly IptvList[]
    activeListId: string | null
    channels: readonly IptvChannel[]
  }): Promise<void>
  setIptvState(input: {
    lists: readonly IptvList[]
    activeListId: string | null
    channels: readonly IptvChannel[]
  }): Promise<void>
  refresh(options?: {
    force?: boolean
    switchToUrlMode?: boolean
  }): Promise<void>
  importFile(file: File): Promise<void>
  selectDate(dateKey: string): void
}
```

- [ ] **Step 1: Write controller RED tests** proving no-list state, immediate cached render, fresh cache skipping background network work, stale cache rendering immediately then background refresh, no-cache foreground refresh, failed refresh preserving stale rows, file-backed mode preventing automatic URL refresh, explicit `switchToUrlMode` replacing file mode, selected-date derivation, and orphan cache cleanup during initialization.

- [ ] **Step 2: Run controller tests** and confirm RED.

- [ ] **Step 3: Implement controller** using injected repository/fetch service/clock. Persist a successful multi-source result transactionally, then re-read normalized cache and derive rows. Never clear existing rows before a new replacement succeeds.

- [ ] **Step 4: Write GuideProvider RED tests** proving it consumes `IptvContext` state, uses a stable controller instance for the provider lifetime, forwards P4 list/channel changes into `setIptvState()`, and exposes `selectList(id)` by calling the existing P4 `selectList()` rather than maintaining a second independent IPTV selection.

- [ ] **Step 5: Implement `GuideProvider`** inside `IptvProvider` in `App.tsx`. Provider methods expose `refresh`, `importFile`, `selectDate`, and `selectList`; `selectList` delegates to `useIptv().selectList()` and lets the normal context update drive the guide controller.

- [ ] **Step 6: Add App/provider regression test** proving the existing Library → IPTV → Guide → Torrent nesting renders without initializing guide network work on non-guide routes. Guide data fetch must stay lazy until `/guide` is active or GuideWorkspace requests initialization.

- [ ] **Step 7: Run controller/provider/App tests and web typecheck**; confirm GREEN.

- [ ] **Step 8: Commit** with `feat: add TV guide state controller`.

---

### Task 6: Functional `/guide` UI and existing-player handoff

**Files:**

- Create: `apps/web/src/components/GuideWorkspace.tsx`
- Create: `apps/web/src/components/GuideWorkspace.test.tsx`
- Modify: `apps/web/src/components/RouteContent.tsx`
- Modify: `apps/web/src/components/RouteContent.test.tsx` if present; otherwise extend `apps/web/src/App.test.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `tests/responsive-css.test.ts`
- Modify: `apps/web/src/app-meta.ts`
- Modify: `apps/web/src/app-meta.test.ts`
- Modify: `apps/web/src/components/Navigation.tsx`
- Modify: `apps/web/src/components/SettingsShell.tsx`
- Modify: `README.md`

**Interfaces:**

```ts
type GuideWorkspaceProps = {
  onPlayChannel: (channel: IptvChannel) => void
}
```

- [ ] **Step 1: Write GuideWorkspace RED markup tests** for no IPTV list, no EPG URLs with XMLTV file action, ready guide with seven date buttons, current/next programme text, unmatched `EPG yok` row, stale-cache warning, file-backed mode, URL-backed refresh controls, and `Kanalı oynat`.

- [ ] **Step 2: Run the GuideWorkspace test** and confirm RED.

- [ ] **Step 3: Implement functional GuideWorkspace** with existing shell classes where practical. Keep visual work functional: list selector, freshness state, refresh/file actions, seven-day tabs, channel rows, programme detail expansion, and channel-play buttons. Do not introduce a separate player or catch-up semantics.

- [ ] **Step 4: Route `/guide` through GuideWorkspace** in `RouteContent`. Add `onPlayGuideChannel` only if needed; preferably reuse the existing `onPlayIptvChannel` callback so App continues to call `playerRequestForIptvChannel()` unchanged.

- [ ] **Step 5: Write/extend App RED test** proving clicking a guide channel callback hands the original `IptvChannel` into the existing IPTV player request path and does not create a new player engine.

- [ ] **Step 6: Add scoped Guide CSS** for scrollable schedule rows, date tabs, status chips, and programme detail. Preserve the P1 desktop/tablet/phone shell; update responsive regression only for required overflow/stacking rules, not a visual redesign.

- [ ] **Step 7: Move current phase copy to `P6 · XMLTV TV Guide`** in app metadata/sidebar/settings. Keep historical P2–P5 docs references intact.

- [ ] **Step 8: Update README** with `livetv-epg`, direct-first fetch, verified URL-backed API fallback, gzip/local-file behavior, 6-hour freshness, 12h/8d retention, seven-day guide, conservative channel matching, stale-cache behavior, and explicit no-generic-proxy/no-DVR/no-auth boundaries.

- [ ] **Step 9: Run Guide/App/responsive/current-phase tests and web typecheck/build**; confirm GREEN.

- [ ] **Step 10: Commit** with `feat: add functional XMLTV TV guide`.

---

### Task 7: Full verification, Docker/browser acceptance, PR/merge

**Files:**

- Modify: `docs/superpowers/plans/2026-08-14-p6-xmltv-tv-guide.md` for evidence/checkmarks only.

- [ ] **Step 1: Full local gate.** Run `npm run verify`, `git diff --check`, `docker compose config`, and direct secret scan on tracked changes. Existing non-fatal HLS chunk warning may remain; P6 must not add a new startup-size regression that defeats lazy media chunks.

- [ ] **Step 2: Docker rebuild/health.** Preserve `YOUTUBE_DATA_API_KEY` without printing it, rebuild current web/api/media-worker/caddy services, verify root/API/media health, and confirm Halk TV still resolves via the official Data API path.

- [ ] **Step 3: Build deterministic EPG fixtures outside the repo** for acceptance: one URL-backed M3U with two channels and `url-tvg`, a multi-day XMLTV feed matching one channel by exact `tvg-id` and another by unique display name, plus an alternate failing/changed feed for stale-cache tests. Serve with controlled CORS behavior from a local fixture process.

- [ ] **Step 4: Browser direct-fetch acceptance.** In a fresh Chrome context, import/select the URL-backed M3U, open `/guide`, verify XMLTV load, exact + display-name matching, now/next, seven date tabs, programme detail, hard-navigation persistence, and one guide channel reaching the existing UnifiedPlayer.

- [ ] **Step 5: Browser fallback acceptance.** Reconfigure fixture CORS so browser direct XMLTV fetch fails and start the Docker/API acceptance stack with `EPG_FETCH_ALLOWED_PRIVATE_HOSTS` containing only the deterministic fixture host. Verify `/api/epg/fetch` succeeds only when the EPG URL is declared by the playlist, and verify a second private host remains rejected. Remove the temporary acceptance override afterward; default production behavior stays public-network-only.

- [ ] **Step 6: Stale-cache acceptance.** After one successful guide load, make all EPG refresh paths fail; manual refresh must show a warning while the previously cached schedule remains rendered and playable.

- [ ] **Step 7: File/paste-list acceptance.** Import a file/paste IPTV list, verify there is no API fallback, import local XMLTV file/gzip, confirm file-backed mode persists across navigation, and verify background freshness does not switch back to URL mode.

- [ ] **Step 8: Regression acceptance.** Check YouTube live status, IPTV list route, Torrent workspace/session idle behavior, P3 History/Favorites/Playlists, and a separate clean browser context with no application console error/warn/issue.

- [ ] **Step 9: Record evidence and commit** with `chore: complete P6 XMLTV guide milestone`.

- [ ] **Step 10: Post-commit verification.** Run `npm test`, tracked commit secret scan, `.env` ignored/untracked proof, and clean-worktree proof. Record evidence in a small docs commit.

- [ ] **Step 11: Integration.** Push detached HEAD as `feat/p6-xmltv-tv-guide`, open PR to `main`, wait for `verify` and `dependency-review`, fix actionable failures without globally weakening policy, merge when green, delete feature branch, fast-forward normal main while preserving ignored `.env`, close integration evidence in this plan, push final docs commit, run `npm ci` if the main checkout dependency tree is stale, then run full `npm run verify` on the final pushed main and confirm its GitHub push CI succeeds.

## Exit Criteria

- [ ] `/guide` is functional rather than placeholder content.
- [ ] Existing P4 `epgUrls` and `tvg-id` metadata drive Guide data without changing IPTV source-of-truth semantics.
- [ ] `fast-xml-parser` shared parser handles XMLTV identifiers, dates, metadata, warnings, and stop-time inference deterministically.
- [ ] Plain and gzip XMLTV are supported within the 50 MiB decompressed limit.
- [ ] Direct browser XMLTV fetch is preferred.
- [ ] URL-backed lists have a verified, public-network-only API fallback that independently validates playlist-declared EPG URLs.
- [ ] File/paste IPTV lists never gain an arbitrary server URL-fetch path and can use local XMLTV files.
- [ ] `livetv-epg` persists normalized schedules, uses transactional replacement, and survives reloads.
- [ ] Failed refreshes preserve stale valid cache.
- [ ] File-backed guide mode is not silently overwritten by background URL refresh.
- [ ] Channel matching is explicit, deterministic, and ambiguity-safe.
- [ ] Current, next, and seven-day programme schedules render for matched channels.
- [ ] Unmatched channels remain visible and playable.
- [ ] Guide channel playback reuses the existing P4/UnifiedPlayer request path.
- [ ] P2/P3/P4/P5 regressions remain clean.
- [ ] Full local verification, Docker/API/browser acceptance, GitHub CI, merge, and final-main verification pass.
