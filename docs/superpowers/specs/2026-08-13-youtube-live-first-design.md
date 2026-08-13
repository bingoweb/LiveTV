# YouTube Live-First Technical Design

## Status

Approved direction: YouTube live playback is the immediate LiveTV priority. Responsive/UI refinement is paused until the live-discovery and playback pipeline is technically reliable.

## Goal

LiveTV must make frequently-live YouTube news channels easy to watch without requiring the user to discover or paste the current broadcast video ID manually.

Initial built-in channels:

- Halk TV — `https://www.youtube.com/@Halktvkanali`
- ANKA Haber Ajansı — `https://www.youtube.com/@ankahaberajans`

Success means that when either channel has an active YouTube live broadcast, LiveTV discovers the current broadcast, shows it as live, and opens it in the existing unified YouTube player with one user action.

## Priority Order

1. Reliable active-live discovery.
2. Reliable YouTube playback in LiveTV.
3. Source switching, retry, offline states, and diagnostics.
4. YouTube Premium/session-friendly embed behavior.
5. Only after the above works reliably: additional UI/responsive polish.

## Discovery Architecture

### Primary path: official YouTube Data API v3

The API service owns YouTube Data API calls. The browser never needs the API key.

The pipeline is:

1. Normalize a configured channel URL or handle.
2. Resolve the handle with `channels.list(part=id,snippet&forHandle=@handle)`.
3. Cache the resulting stable channel ID because channel IDs do not need to be re-resolved for every live check.
4. Find active broadcasts with `search.list(part=snippet&channelId=<id>&type=video&eventType=live&videoEmbeddable=true)`.
5. If a result exists, verify/enrich it using `videos.list(part=snippet,liveStreamingDetails,status&id=<videoId>)`.
6. Return a normalized LiveTV live-broadcast object containing channel ID, video ID, title, thumbnail, live state, start time when available, and canonical watch URL.

The current YouTube API documentation supports handle lookup through `forHandle`, active-broadcast filtering through `eventType=live` with `type=video`, embeddable-video filtering, and `liveStreamingDetails` on video resources.

### Secondary path: existing channel `/live` resolver

The already-implemented `/@handle/live` page resolver remains as a pragmatic fallback rather than the primary discovery mechanism.

Fallback is used when:

- `YOUTUBE_DATA_API_KEY` is not configured,
- the Data API is temporarily unavailable,
- API quota/rate policy blocks a lookup,
- or the API returns an unexpected transient failure.

This fallback is deliberately retained because the product goal is working playback, not enforcing a single discovery mechanism.

## API Key Configuration

Use one server-side environment variable:

`YOUTUBE_DATA_API_KEY`

The key is read by `apps/api`; it is not bundled into the Vite client. No OAuth login is required for public channel/live discovery.

The application must continue to function without the key by using the existing fallback resolver and clearly reporting that official API discovery is unavailable.

## Quota and Caching Strategy

The implementation should avoid repeated network work without imposing restrictive behavior.

- Handle → channel ID: cache for a long period in process memory; configured built-in channels may be pre-resolved and reused.
- Active-live lookup: short cache, approximately 20–30 seconds.
- Offline result: shorter cache than channel metadata so a newly-started broadcast appears quickly.
- Manual refresh bypasses the short live-result cache.
- Never poll more aggressively merely because the player is open; normal user refresh and modest periodic refresh are enough.

Current YouTube documentation lists `channels.list` and `videos.list` at 1 quota unit each. `search.list` currently uses the Search Queries quota bucket and documents a 1-unit request cost with its own daily search-call limit. This makes short caching useful but does not justify crippling the live experience.

## Built-In Live Channel Model

LiveTV starts with a small source registry:

```text
Halk TV
  handle: @Halktvkanali
  channelUrl: https://www.youtube.com/@Halktvkanali

ANKA Haber Ajansı
  handle: @ankahaberajans
  channelUrl: https://www.youtube.com/@ankahaberajans
```

The registry must be data-driven so more channels can later be added without changing player code.

Each card/source can be in these states:

- checking
- live
- offline
- temporarily unavailable

When live, selecting the channel passes the resolved YouTube watch URL/video ID into the existing unified player controller.

## YouTube Playback and Premium-Friendly Behavior

LiveTV does not implement ad blocking or manipulate YouTube media requests.

Two embed modes remain available:

### Premium/session-friendly mode — default

- standard `youtube.com` embed behavior,
- `origin` set to the current LiveTV origin,
- normal YouTube cookies/session behavior allowed,
- intended to give YouTube the best opportunity to recognize the user's existing signed-in/Premium browser session where the platform supports that behavior.

### Privacy mode — optional

- `youtube-nocookie.com` behavior through Plyr's `noCookie` option,
- useful for users who prefer reduced YouTube cookie/session coupling,
- not the default because the current project priority favors account/Premium-session compatibility.

LiveTV cannot promise that an embedded player will always inherit Premium benefits because that decision belongs to YouTube. It must not fake, bypass, or suppress YouTube ads outside YouTube's supported playback behavior.

## Error and Fallback Behavior

The application should favor recovery rather than blocking.

- Channel offline: show `Şu anda canlı yayın yok` and retain a refresh action.
- Data API unavailable: automatically try the existing `/live` resolver.
- Both discovery paths fail: show a concise technical reason and allow retry.
- A resolved video becomes unavailable: refresh discovery once before surfacing the error.
- Embed restriction: report that YouTube does not allow that broadcast to play in an external embed; offer opening the canonical YouTube watch page as a fallback action.
- Player API failure: destroy the stale adapter before retrying.

## Security/Restriction Philosophy for This Phase

Do not add strict policies that impair playback, account recognition, YouTube embeds, live discovery, or normal browser media behavior.

Keep only practical protections that do not interfere with operation, such as input normalization, timeouts, bounded retries, and keeping the server API key out of the client bundle. Do not add restrictive CSP, cookie blocking, referer stripping, proxy rules, or origin rules merely for theoretical hardening if they break YouTube playback.

## Testing

### Unit tests

- handle extraction/normalization,
- Data API response parsing,
- active-live vs offline resolution,
- API-first then fallback behavior,
- cache behavior and manual refresh bypass,
- built-in channel registry,
- Premium/session-friendly embed configuration.

### API integration tests

Use deterministic mocked Google responses to verify:

- `channels.list` request composition,
- `search.list` request composition (`channelId`, `type=video`, `eventType=live`, `videoEmbeddable=true`),
- `videos.list` verification/enrichment,
- fallback activation after API failure.

### Browser acceptance

With a real configured API key:

1. Load LiveTV.
2. Refresh Halk TV and ANKA live status.
3. If either is live, click it and verify the resolved current broadcast opens in the unified player.
4. Verify source switching does not leave stale YouTube player instances.
5. Verify normal standard YouTube embed mode is used by default.
6. Check browser console and network for actual playback/discovery failures.

If neither channel happens to be live during acceptance, use a known currently-live public channel only for the playback acceptance while still verifying Halk TV and ANKA correctly report offline.

## Non-Goals for This Milestone

- responsive redesign,
- general visual polish,
- YouTube subscription/library synchronization,
- Google OAuth account management,
- ad blocking,
- downloading/recording YouTube video,
- torrent playback work,
- IPTV work.

## Exit Criteria

- `YOUTUBE_DATA_API_KEY` is supported by the API service.
- Halk TV and ANKA exist as built-in YouTube live sources.
- Official YouTube Data API is the primary live-discovery path.
- Existing `/live` resolver automatically serves as fallback.
- Active broadcast discovery returns the current changing video ID without hardcoding it.
- A discovered live broadcast opens in the existing unified player.
- Standard/Premium-session-friendly YouTube embed mode is the default.
- Live discovery and playback errors are recoverable and visible.
- Full repository tests/build/license checks pass.
- Docker/Caddy/API/browser acceptance passes before the milestone is declared complete.
