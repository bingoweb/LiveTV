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

- [x] **Step 11: Commit** with `feat: add shared XMLTV parsing`. Commit: `4b2eb40`.

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
  lookupImpl?: (hostname: string) => Promise<
    Array<{ address: string; family: 4 | 6 }>
  >
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

- [x] **Step 1: Write `public-http-text` RED tests** covering invalid protocol, public/private IPv4/IPv6 classification, private DNS rejection, exact private-host allowlist, redirect revalidation, redirect limit, timeout, response-size overflow, gzip normalization, and no cookie forwarding.

- [x] **Step 2: Run** the public HTTP test; RED was confirmed because `../src/public-http-text` did not exist.

- [x] **Step 3: Implement public-address validation** with `node:net`, explicit IPv4/IPv6 blocked ranges, DNS-all-address validation, and exact-host private allowlist semantics.

- [x] **Step 4: Implement `fetchPublicHttpText()`** with validated pinned DNS, manual revalidated redirects, timeout, streaming limits, gzip decode, original hostname/SNI preservation, and constant upstream headers only. Node 24's `lookup(...,{all:true})` callback shape is handled by the pinned lookup seam.

- [x] **Step 5: Re-run public-http tests**; all 7 behavior tests pass.

- [x] **Step 6: Write `epg-fallback` RED tests** proving playlist-first verification, relative declaration resolution, undeclared URL rejection without a second fetch, stage-specific limits, typed failures, and Fastify route behavior.

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

- [x] **Step 7: Implement `fetchVerifiedEpg()`** with playlist-first declaration verification and typed `EpgFallbackError` mapping; route handling uses error code/status rather than message matching.

- [x] **Step 8: Write Fastify route RED tests** for successful XML response, missing-field rejection, and typed structured fallback errors; lower-level tests cover unsafe/network/size mappings.

- [x] **Step 9: Add injectable `epgFetcher` to `buildApi()`** and exactly one `POST /api/epg/fetch` endpoint. `EPG_FETCH_ALLOWED_PRIVATE_HOSTS` is parsed once at API construction and passed to the verified fetch layer.

- [x] **Step 10: Wire server-only environment configuration.** `.env.example` and API Compose service carry `EPG_FETCH_ALLOWED_PRIVATE_HOSTS`; regression test proves the web service does not receive it and no `VITE_*` equivalent exists.

- [x] **Step 11: Run API tests and API typecheck.** Evidence: 28/28 focused tests pass across public HTTP, EPG fallback, YouTube live resolver, and Compose regression; API typecheck exits 0 and `docker compose config` passes.

- [x] **Step 12: Commit** with `feat: add verified XMLTV fallback endpoint`. Commit: `c565ac9`.

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
  position: number
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

- [x] **Step 1: Write repository RED tests** with `fake-indexeddb` covering ordered multi-source persistence, transactional rollback, 12-hour/8-day retention, deletion/orphan cleanup, and malformed stored-row filtering. The tests exercise the list/source indexes through real IndexedDB reads.

- [x] **Step 2: Run** the repository/matcher/derivation tests; RED was confirmed because the P6 guide modules did not exist.

- [x] **Step 3: Implement `epg-db.ts` and repository** with `sources`, `channels`, and `programmes`, deterministic ids, source ordering, per-operation DB lifecycle, one-transaction replacement, retention filtering, defensive row guards, and best-effort orphan cleanup.

- [x] **Step 4: Write channel matcher RED tests** for exact id across sources, unique folded id, `tvgName`/name fallback, ambiguity, meaningful HD/4K preservation, and weak-claim collision.

- [x] **Step 5: Implement `matchIptvChannelsToXmltv()`** returning one row per IPTV channel plus all source-specific XMLTV channel records for a logical match. Exact ids may span multiple sources; folded/display-name fallbacks remain uniqueness- and claim-safe.

```ts
export type ChannelGuideMatch = {
  channel: IptvChannel
  xmltvChannels: EpgChannelRecord[]
  match: 'exact-id' | 'folded-id' | 'display-name' | 'none'
}
```

- [x] **Step 6: Write guide derivation RED tests** for current/next/progress, selected-day filtering, source-order dedupe, and unmatched-channel retention.

- [x] **Step 7: Implement pure `deriveGuideRows()`** with injected clock/date-key seams. It merges source-specific matches by persisted source position, performs IPTV-level programme dedupe, and emits UI-ready current/next/day rows without IndexedDB/player dependencies.

- [x] **Step 8: Run repository/matcher/derivation tests and web typecheck.** Evidence: 13/13 focused tests pass and web typecheck exits 0. During the first run, a hanging readonly transaction exposed a DB-lifecycle mismatch versus P4; the repository was corrected to open/close per operation and attach completion listeners before requests.

- [x] **Step 9: Commit** with `feat: add persistent EPG guide cache`. Commit: `571f394`.

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

- [x] **Step 1: Write payload RED tests** for plain UTF-8 XML, gzip magic detection/decompression, decompressed-size rejection, oversized plain payloads, and a clear unsupported-gzip error when no decompressor exists.

- [x] **Step 2: Run payload tests**; RED was confirmed because the payload decoder module did not exist.

- [x] **Step 3: Implement payload decoding** with chunk-bounded `ReadableStream` collection, gzip magic detection, optional platform `DecompressionStream`, decompressed-size enforcement, and non-fatal UTF-8 replacement decoding. Already-decoded browser responses remain plain because magic bytes are absent.

- [x] **Step 4: Write fetch-service RED tests** proving direct-first behavior, URL-backed API fallback, no fallback for file/paste lists, partial-source warning behavior, and all-source failure.

- [x] **Step 5: Implement direct/fallback URL fetch** with 20-second abort timeout, bounded response reads, `credentials: 'omit'`, and fallback POST body limited to `{ playlistUrl, epgUrl }`.

- [x] **Step 6: Write local-file RED tests** for plain XMLTV, gzip magic detection independent of filename, and configurable size ceiling.

- [x] **Step 7: Implement `importGuideFile()`** returning one file-backed parsed source without retaining File handles or raw XML.

- [x] **Step 8: Run fetch/payload tests and web typecheck.** Evidence: 13/13 focused tests pass and web typecheck exits 0.

- [x] **Step 9: Commit** with `feat: add XMLTV fetch and import service`. Commit: `d518b9c`.

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
  tick(): void
}
```

- [x] **Step 1: Write controller RED tests** covering no-list state, fresh-cache no-fetch, stale cache + background refresh, failed-refresh preservation, file-mode no-auto-refresh, explicit URL-mode switch, local file import/date selection, and orphan cleanup.

- [x] **Step 2: Run controller tests**; RED was confirmed because `guide-controller`/`guide-context` did not exist.

- [x] **Step 3: Implement controller** with injected repository/fetch/import/clock/date-key dependencies, cache-first rendering, transaction-backed replacement via the repository, stale URL-mode background refresh, file-mode protection, and stale-row preservation on failure.

- [x] **Step 4: Write GuideProvider RED tests** proving one pinned controller instance, no automatic guide initialization, lazy snapshot rendering, and list-selection delegation to P4 IPTV context.

- [x] **Step 5: Implement `GuideProvider`** inside `IptvProvider` in `App.tsx`. It forwards IPTV state changes without initializing network/cache work, exposes lazy `initialize`, refresh/import/date methods, and delegates list selection to P4.

- [x] **Step 6: Add App/provider regression coverage** through existing App SSR tests plus GuideProvider source/runtime tests. The provider is nested Library → IPTV → Guide → Torrent and contains no automatic `controller.initialize()` call.

- [x] **Step 7: Run controller/provider/App tests and web typecheck.** Evidence: 14/14 focused tests pass and web typecheck exits 0.

- [x] **Step 8: Commit** with `feat: add TV guide state controller`. Commit: `1838be0`.

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

- [x] **Step 1: Write GuideWorkspace RED markup tests** for no IPTV list, no EPG URLs with XMLTV file action, seven date buttons, current/next programme text, unmatched `EPG yok`, stale warning, file-backed mode, URL refresh, and channel-play actions. Current-phase/App tests were moved to P6 in the same RED cycle.

- [x] **Step 2: Run the GuideWorkspace/current-phase tests**; RED was confirmed because `GuideWorkspace` did not exist and production copy still identified P5.

- [x] **Step 3: Implement functional GuideWorkspace** with lazy guide initialization, list/freshness/source state, refresh/file actions, seven local calendar days, current/next/progress, expandable programme details, unmatched rows, and channel-play buttons. A 60-second local tick re-derives now/next without network work.

- [x] **Step 4: Route `/guide` through GuideWorkspace** and reuse `onPlayIptvChannel` directly. No guide-specific player request/adapter was introduced.

- [x] **Step 5: Extend App/route regression coverage** so `/guide` renders the real workspace instead of the XMLTV placeholder; the route passes the existing `onPlayIptvChannel` callback directly to GuideWorkspace. The final browser acceptance will click a real Guide channel and prove the existing UnifiedPlayer request path end-to-end.

- [x] **Step 6: Add scoped Guide CSS** for source controls, scrollable seven-day strip, shrink-safe channel rows, now/next panels, programme details, and phone stacking. Responsive regression explicitly checks horizontal date scrolling and one-column mobile now/next layout.

- [x] **Step 7: Move current phase copy to `P6 · XMLTV TV Guide`** in app metadata/sidebar/settings/source status while preserving historical P2–P5 documentation.

- [x] **Step 8: Update README** with `livetv-epg`, direct-first fetch, verified/SSRF-constrained URL-backed fallback, exact-host LAN opt-in, gzip/local-file mode, freshness/retention, seven-day guide, conservative matching, stale cache, and no-generic-proxy/no-DVR/no-auth boundaries.

- [x] **Step 9: Run Guide/App/responsive/current-phase tests and web typecheck/build.** Final Task 6 evidence: 67/67 focused P6/shared/P4/App/responsive tests pass; shared + web typechecks exit 0; production web build succeeds. Self-review added RED→GREEN coverage for whitespace-separated M3U EPG URLs, per-source channel matching, unusable-empty XMLTV rejection, and minute clock ticks. WebTorrent remains separately lazy-loaded; the initial app chunk stays below the existing 500 kB warning threshold, while the pre-existing HLS chunk warning remains non-fatal.

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
