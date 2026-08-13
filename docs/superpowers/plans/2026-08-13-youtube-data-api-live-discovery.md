# YouTube Data API Live Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make LiveTV discover the current Halk TV and ANKA YouTube live broadcasts through the official YouTube Data API first, automatically fall back to the existing `/live` resolver, and open the resulting current video reliably in the existing unified player.

**Architecture:** Add a small server-only YouTube Data API client with in-memory handle and live-result caches. Keep the current HTML `/live` resolver as a separate fallback path and compose both behind `/api/youtube/resolve-live`. The web client remains a thin consumer: it displays the built-in channel registry, can bypass the short live cache on manual refresh, and feeds the resolved watch URL into the existing YouTube/Plyr adapter.

**Tech Stack:** Node.js 22+, TypeScript 6, Fastify 5, Vitest 4, React 19, existing `@livetv/player-core`, Plyr 3.8.4, native `fetch`/`URL`.

## Global Constraints

- YouTube live discovery and real playback are the blocking priority; do not spend this milestone on responsive redesign or general visual polish.
- Read the API key only from server-side `YOUTUBE_DATA_API_KEY`; never expose it through Vite/client code.
- Official YouTube Data API v3 is primary; the existing channel `/live` resolver is an automatic operational fallback.
- Handle → channel ID cache is long-lived in process memory; live results use a 25 second TTL, offline results a 15 second TTL.
- Manual refresh bypasses only the short live-result cache; it may reuse the stable handle → channel ID cache.
- Keep bounded timeouts/retries, but do not introduce restrictive CSP, cookie blocking, referer stripping, proxy rules, or origin rules that can break YouTube playback.
- Premium/session-friendly mode remains the default: normal `youtube.com` embed, current page `origin`, `noCookie: false`.
- No OAuth account management, ad blocking, recording, downloading, torrent work, IPTV work, or P3 library work in this milestone.

---

## File Structure

- Create `apps/api/src/youtube-data-api.ts`: input normalization, Data API request composition/parsing, channel-ID cache, short live-state cache.
- Create `apps/api/src/youtube-live-service.ts`: API-first/fallback orchestration and normalized discovery metadata.
- Modify `apps/api/src/youtube-live.ts`: keep it focused on the existing HTML `/live` fallback and expose that role explicitly.
- Modify `apps/api/src/app.ts`: construct one resolver per Fastify app, read `YOUTUBE_DATA_API_KEY`, accept `refresh=1`, and preserve cache state across requests.
- Create `apps/api/test/youtube-data-api.test.ts`: deterministic mocked Google API contract/cache tests.
- Modify `apps/api/test/youtube-live.test.ts`: fallback and API-route orchestration tests.
- Modify `apps/web/src/youtube/live-channels.ts`: richer resolver payload plus manual-refresh cache bypass.
- Modify `apps/web/src/youtube/live-channels.test.ts`: built-in registry, metadata, independent failure, and refresh-query tests.
- Modify `apps/web/src/components/UnifiedPlayer.tsx`: use forced rediscovery on manual refresh/channel open when needed and keep retry/recovery visible.
- Modify `apps/web/src/App.test.tsx`: user-visible live/offline/retry wording contract.
- Modify `.env.example` and `README.md`: document `YOUTUBE_DATA_API_KEY`, API-first/fallback behavior, cache semantics, and acceptance commands.

---

### Task 1: Official YouTube Data API client

**Files:**

- Create: `apps/api/src/youtube-data-api.ts`
- Create: `apps/api/test/youtube-data-api.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export type YouTubeDataApiResolution =
    | {
        status: 'live'
        channelId: string
        videoId: string
        videoUrl: string
        title?: string
        thumbnailUrl?: string
        actualStartTime?: string
        concurrentViewers?: string
      }
    | { status: 'offline'; channelId: string }

  export type YouTubeDataApiClient = {
    resolveChannelLive(
      input: string,
      options?: { refresh?: boolean },
    ): Promise<YouTubeDataApiResolution>
  }

  export function createYouTubeDataApiClient(options: {
    apiKey: string
    fetchImpl?: typeof fetch
    now?: () => number
  }): YouTubeDataApiClient
  ```

- [x] **Step 1: Write failing tests for handle/channel normalization and request composition**

  Add tests that call `resolveChannelLive('https://www.youtube.com/@Halktvkanali')` with a mocked `fetch` sequence and assert:

  ```ts
  const channelsUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]))
  expect(channelsUrl.pathname).toBe('/youtube/v3/channels')
  expect(channelsUrl.searchParams.get('part')).toBe('id,snippet')
  expect(channelsUrl.searchParams.get('forHandle')).toBe('@Halktvkanali')
  expect(channelsUrl.searchParams.get('key')).toBe('test-key')

  const searchUrl = new URL(String(fetchImpl.mock.calls[1]?.[0]))
  expect(searchUrl.pathname).toBe('/youtube/v3/search')
  expect(searchUrl.searchParams.get('channelId')).toBe('UC_HALKT_TEST')
  expect(searchUrl.searchParams.get('type')).toBe('video')
  expect(searchUrl.searchParams.get('eventType')).toBe('live')
  expect(searchUrl.searchParams.get('videoEmbeddable')).toBe('true')
  expect(searchUrl.searchParams.get('maxResults')).toBe('10')
  ```

- [x] **Step 2: Run the new API-client test and verify RED**

  Run:

  ```bash
  npm run test --workspace @livetv/api -- --run test/youtube-data-api.test.ts
  ```

  Expected: FAIL because `createYouTubeDataApiClient` does not exist.

- [x] **Step 3: Implement channel reference parsing and the minimum Data API client**

  `youtube-data-api.ts` must:

  ```ts
  const DATA_API_BASE = 'https://www.googleapis.com/youtube/v3'
  const CHANNEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000
  const LIVE_CACHE_TTL_MS = 25_000
  const OFFLINE_CACHE_TTL_MS = 15_000
  ```

  Accept `@handle`, `youtube.com/@handle`, and `youtube.com/channel/UC...`. A direct channel ID skips `channels.list`; a handle calls `channels.list(part=id,snippet&forHandle=...)`. Invalid/non-YouTube URLs throw a client-input error before any Google request.

- [x] **Step 4: Add RED tests for live enrichment and offline behavior**

  Mock `search.list` with one active video and `videos.list` with:

  ```json
  {
    "items": [
      {
        "id": "1uvsDurqSpM",
        "snippet": {
          "title": "#CANLI | Günaydın Türkiye",
          "thumbnails": {
            "high": {
              "url": "https://i.ytimg.com/vi/1uvsDurqSpM/hqdefault.jpg"
            }
          }
        },
        "status": { "embeddable": true },
        "liveStreamingDetails": {
          "actualStartTime": "2026-08-13T04:30:00Z",
          "concurrentViewers": "1234"
        }
      }
    ]
  }
  ```

  Assert `status: 'live'`, current `videoId`, canonical `videoUrl`, title, thumbnail, start time, and viewer count. Add a second test where `search.list.items` is empty and assert `{ status: 'offline', channelId }` without calling `videos.list`.

- [x] **Step 5: Implement live verification/enrichment and API errors**

  Build requests with `URL`/`URLSearchParams`, a 12 second `AbortSignal.timeout`, and explicit JSON response validation. For non-2xx Google responses, throw an error containing the HTTP status and YouTube error message when present. Do not silently convert API errors into offline state.

- [x] **Step 6: Add RED tests for caching and manual refresh bypass**

  Use an injectable `now()` and assert:

  ```ts
  await client.resolveChannelLive('@Halktvkanali')
  await client.resolveChannelLive('@Halktvkanali')
  expect(searchCallCount()).toBe(1)

  await client.resolveChannelLive('@Halktvkanali', { refresh: true })
  expect(searchCallCount()).toBe(2)
  expect(channelsCallCount()).toBe(1)
  ```

  Advance fake time past 15 seconds for an offline result and assert a fresh search; separately verify a live result remains cached until 25 seconds.

- [x] **Step 7: Implement the two caches and make all Task 1 tests GREEN**

  Cache handle → channel ID independently from channel ID → live resolution. `{ refresh: true }` ignores only the live-result cache. Never cache thrown errors.

- [x] **Step 8: Run Task 1 tests/typecheck and commit**

  Run:

  ```bash
  npm run test --workspace @livetv/api -- --run test/youtube-data-api.test.ts
  npm run typecheck --workspace @livetv/api
  ```

  Then commit:

  ```bash
  git add apps/api/src/youtube-data-api.ts apps/api/test/youtube-data-api.test.ts
  git commit -m "feat: add YouTube Data API live client"
  ```

---

### Task 2: API-first discovery with automatic `/live` fallback

**Files:**

- Create: `apps/api/src/youtube-live-service.ts`
- Modify: `apps/api/src/youtube-live.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/youtube-live.test.ts`

**Interfaces:**

- Consumes: `createYouTubeDataApiClient(...)` from Task 1 and the existing HTML resolver.
- Produces:

  ```ts
  export type YouTubeLiveDiscoveryMethod =
    'data-api' | 'live-page' | 'live-page-fallback'

  export function createYouTubeLiveResolver(options: {
    apiKey?: string
    fetchImpl?: typeof fetch
    now?: () => number
  }): (
    input: string,
    options?: { refresh?: boolean },
  ) => Promise<
    YouTubeLiveResolution & {
      liveUrl: string
      discoveryMethod: YouTubeLiveDiscoveryMethod
      officialApiAvailable: boolean
      videoUrl?: string
      warning?: string
    }
  >
  ```

- [x] **Step 1: Refactor the current HTML resolver name without changing behavior**

  Rename its network entry point to:

  ```ts
  export async function resolveYouTubeChannelLivePage(
    input: string,
    fetchImpl: typeof fetch = fetch,
  )
  ```

  Keep `normalizeYouTubeChannelLiveUrl` and `extractYouTubeLivePage` behavior intact.

- [x] **Step 2: Write RED orchestration tests**

  Cover four cases:

  1. no API key → `/live` fallback only, `officialApiAvailable: false`, `discoveryMethod: 'live-page'`;
  2. API key + successful Google sequence → no YouTube HTML request, `discoveryMethod: 'data-api'`;
  3. Google 403/429/5xx or network error → HTML `/live` fallback, `discoveryMethod: 'live-page-fallback'` and a concise `warning`;
  4. both Google and `/live` fail → API returns HTTP 502 with `youtube_live_resolution_failed`.

- [x] **Step 3: Implement `createYouTubeLiveResolver`**

  Construct the Data API client once when a key exists. A valid Data API `offline` result is authoritative and does not trigger scraping. Only missing-key or Data API failure uses the HTML resolver.

- [x] **Step 4: Wire Fastify to one persistent resolver instance and `refresh=1`**

  Change options to:

  ```ts
  type BuildApiOptions = {
    fetchImpl?: typeof fetch
    youtubeApiKey?: string
    now?: () => number
  }
  ```

  Use `options.youtubeApiKey ?? process.env.YOUTUBE_DATA_API_KEY`. Extend query typing to `{ url?: string; refresh?: string }` and call:

  ```ts
  resolver(input, { refresh: request.query.refresh === '1' })
  ```

- [x] **Step 5: Run Task 2 tests/typecheck and commit**

  Run:

  ```bash
  npm run test --workspace @livetv/api -- --run test/youtube-live.test.ts test/youtube-data-api.test.ts
  npm run typecheck --workspace @livetv/api
  ```

  Commit:

  ```bash
  git add apps/api/src/youtube-live.ts apps/api/src/youtube-live-service.ts apps/api/src/app.ts apps/api/test/youtube-live.test.ts
  git commit -m "feat: prefer official YouTube live discovery"
  ```

---

### Task 3: Web live-channel data contract and cache-bypassing refresh

**Files:**

- Modify: `apps/web/src/youtube/live-channels.ts`
- Modify: `apps/web/src/youtube/live-channels.test.ts`

**Interfaces:**

- Produces:

  ```ts
  export type LiveChannelLoadOptions = { refresh?: boolean }

  export function loadFeaturedLiveStatuses(
    fetchImpl?: FetchLike,
    options?: LiveChannelLoadOptions,
  ): Promise<LiveChannelStatus[]>
  ```

- [x] **Step 1: Write RED tests for resolver metadata and manual refresh**

  Extend the live payload fixture with:

  ```json
  {
    "discoveryMethod": "data-api",
    "officialApiAvailable": true,
    "actualStartTime": "2026-08-13T04:30:00Z",
    "concurrentViewers": "1234"
  }
  ```

  Assert those fields survive in `LiveChannelStatus`. Then call:

  ```ts
  await loadFeaturedLiveStatuses(fetchImpl, { refresh: true })
  ```

  and assert both requests contain `refresh=1`.

- [x] **Step 2: Implement the richer payload and refresh option**

  Preserve Halk TV and ANKA as a data-driven registry. Keep failures per-channel so one bad response never hides the other source. Rename the user-facing error state only if necessary; do not conflate an API failure with `offline`.

- [x] **Step 3: Run web channel tests/typecheck and commit**

  Run:

  ```bash
  npm run test --workspace @livetv/web -- --run src/youtube/live-channels.test.ts
  npm run typecheck --workspace @livetv/web
  ```

  Commit:

  ```bash
  git add apps/web/src/youtube/live-channels.ts apps/web/src/youtube/live-channels.test.ts
  git commit -m "feat: expose resilient live channel status"
  ```

---

### Task 4: Player recovery and live-channel interaction

**Files:**

- Modify: `apps/web/src/components/UnifiedPlayer.tsx`
- Modify: `apps/web/src/App.test.tsx`
- Test existing: `apps/web/src/player/player-config.test.ts`

**Interfaces:**

- Consumes: `/api/youtube/resolve-live?url=...&refresh=1` and existing `PlayerController`.
- Preserves: `readYouTubeEmbedMode()` default `premium-session` and `buildYouTubePlyrOptions(..., 'premium-session')` → `noCookie: false` + current origin.

- [x] **Step 1: Write RED rendering/interaction contract tests**

  Ensure the YouTube route continues to render Halk TV, ANKA, the Premium control, refresh control, and clear live/offline/unavailable wording. Add assertions for `Şu anda canlı yayın yok` or equivalent explicit offline wording rather than a generic disabled state.

- [x] **Step 2: Make manual channel refresh bypass the server live cache**

  Change only the explicit `Yenile` action to:

  ```ts
  loadFeaturedLiveStatuses(fetch, { refresh: true })
  ```

  Keep 30-second background/focus refreshes cache-friendly.

- [x] **Step 3: Avoid stale video IDs when opening a featured channel**

  On a live channel click, force one fresh resolver lookup before loading the YouTube adapter. If the forced lookup reports offline, destroy the old adapter and surface the offline message instead of replaying the previous video ID.

- [x] **Step 4: Add one bounded rediscovery attempt when channel-based player loading fails**

  For channel references only: destroy the failed adapter, resolve once with `refresh=1`, and retry `controller.load` once. Do not loop. Direct YouTube video URLs, HLS, and direct media retain their existing path.

- [x] **Step 5: Verify Premium/session mode has not regressed**

  Run:

  ```bash
  npm run test --workspace @livetv/web -- --run src/player/player-config.test.ts src/App.test.tsx src/youtube/live-channels.test.ts
  ```

  Expected: the Premium-session test still asserts `noCookie: false` and the supplied origin.

- [x] **Step 6: Run web typecheck and commit**

  Run:

  ```bash
  npm run typecheck --workspace @livetv/web
  ```

  Commit:

  ```bash
  git add apps/web/src/components/UnifiedPlayer.tsx apps/web/src/App.test.tsx
  git commit -m "feat: recover stale YouTube live playback"
  ```

---

### Task 5: Environment documentation and deterministic exit verification

**Files:**

- Modify: `.env.example`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-13-youtube-data-api-live-discovery.md` as checkboxes complete.

**Interfaces:**

- Documents server variable: `YOUTUBE_DATA_API_KEY=`.

- [x] **Step 1: Document configuration and behavior**

  Add `YOUTUBE_DATA_API_KEY=` to `.env.example`. Update README so it states that official Data API discovery is primary when configured, the HTML `/live` path is automatic fallback, manual refresh bypasses the short live cache, and the key never belongs in Vite client variables.

- [x] **Step 2: Run the full repository quality gate**

  Run:

  ```bash
  npm run verify
  ```

  Expected: format, lint, typecheck, all Vitest tests, all workspace builds, and license checks PASS.

- [x] **Step 3: Verify container/reverse-proxy acceptance**

  Locate the repository's existing Compose file/config and run the existing project acceptance sequence through Caddy. Minimum assertions:

  ```text
  GET /                         -> 2xx
  GET /api/health               -> 2xx
  GET /media/health             -> 2xx
  GET /api/youtube/resolve-live -> valid live/offline response for a configured channel
  ```

  If `YOUTUBE_DATA_API_KEY` is absent locally, verify the real `/live` fallback path and use deterministic mocked tests as proof of the API-key path; do not fabricate a successful real Data API call.

- [x] **Step 4: Browser acceptance on the real app**

  Using Playwright/Chrome DevTools against the Caddy entry point:

  1. open the YouTube route;
  2. verify Halk TV and ANKA status requests complete;
  3. click a channel that is actually live and confirm the current video enters the YouTube player;
  4. verify the default iframe/session mode uses normal `youtube.com`, not `youtube-nocookie.com`;
  5. refresh channel status and verify a `refresh=1` request;
  6. inspect console/network for actual resolver or player failures;
  7. switch sources and confirm stale YouTube player instances are removed.

- [x] **Step 5: Check API-key availability without printing the secret**

  Run a command that reports only `configured` or `not configured`; never echo the key itself. If not configured, record that real official-API acceptance remains environment-dependent while fallback playback remains testable.

- [ ] **Step 6: Final commit and push**

  After every gate passes or any environment-only limitation is explicitly documented:

  ```bash
  git add .env.example README.md docs/superpowers/plans/2026-08-13-youtube-data-api-live-discovery.md
  git commit -m "docs: complete YouTube live discovery milestone"
  git push origin main
  ```

## Exit Criteria

- [x] `YOUTUBE_DATA_API_KEY` is supported server-side and never required in the browser bundle.
- [x] Halk TV and ANKA remain built-in data-driven live sources.
- [x] Official YouTube Data API is primary when configured.
- [x] Existing `/live` resolver automatically takes over when the official API is unavailable or unconfigured.
- [x] Current changing live video IDs are discovered instead of hardcoded.
- [x] Live/offline results use short bounded caches and manual refresh bypasses the live cache.
- [x] A channel-based player failure gets at most one forced rediscovery/retry.
- [x] Premium/session-friendly `youtube.com` mode remains the default without ad-bypass logic.
- [x] Full repository verification passes.
- [x] Caddy/API/browser acceptance is completed with a real configured YouTube Data API key and the automatic `/live` fallback separately verified.

## Completion Evidence

- A Google Cloud API key named `LiveTV YouTube Data API` was created in the existing project and restricted to `YouTube Data API v3`; the secret value is not stored in Git.
- The local ignored `.env` provides the key only to the API service through Compose.
- Real Caddy/API acceptance returned `discoveryMethod: "data-api"`, `officialApiAvailable: true`, and the current Halk TV live video without a warning.
- The no-key acceptance path was also exercised successfully: the same endpoint resolved Halk TV through `discoveryMethod: "live-page"` while ANKA reported offline.
- Chrome DevTools verified the standard `youtube.com/embed/...` player with `noCookie=false`, current `origin`, `refresh=1` requests, explicit offline handling, zero stale YouTube iframes after switching to an offline channel, and no console errors/warnings/issues.
