# P2 Unified Player Implementation Plan

**Goal:** Replace the P1 player placeholder with one LiveTV playback surface that accepts YouTube, HLS, and supported direct media URLs.

**Architecture:** Keep URL classification and controller state in `@livetv/player-core`; keep browser/media APIs in `apps/web`. HTML5/HLS playback uses one `<video>` surface enhanced by Plyr, HLS uses HLS.js when MSE is available and native HLS otherwise, and YouTube uses Plyr's YouTube provider. Source switches must destroy the previous adapter before creating the next one.

**Dependencies:** Plyr 3.8.4, HLS.js 1.7.0, existing React/Vite stack.

## Constraints

- P2 handles only YouTube, HLS, and direct HTTP(S) media.
- **Priority override (2026-08-13): YouTube live discovery and real playback are the blocking goal. Responsive polish is frozen until the live-TV path is technically reliable.**
- Torrent URLs/magnets remain P5 and must not be treated as direct media.
- No recording, downloading, archival, or offline media caching.
- Do not autoplay without an explicit user action.
- YouTube embeds must use the current page origin when JS API control is enabled.
- HLS should prefer HLS.js when supported and fall back to native HLS playback when the browser provides it.

## Current priority order

1. Resolve a YouTube channel/@handle to its current live broadcast reliably.
2. Prove that the resolved broadcast actually enters the YouTube `playing` state, not merely that an iframe exists.
3. Surface live/offline state and current broadcast metadata for the configured channels.
4. Make source switching, retries, stale-player cleanup, and failure handling reliable.
5. Only after the playback path is stable, resume non-blocking responsive/UI polish.

### Task 1: Player-core contracts and URL classification

- [x] Add failing tests for YouTube URL parsing, HLS detection, direct media detection, and unsupported sources.
- [x] Add `PlayerSource`, error types, source classifier, adapter contract, and `PlayerController`.
- [x] Verify controller source switching destroys the old adapter.
- [x] Keep extensionless/signed HTTP(S) sources usable and allow an explicit source-engine preference.

### Task 2: Browser adapters

- [x] Add Plyr + HLS.js dependencies and verify license policy.
- [x] Add HTML5/Plyr adapter with direct media, fullscreen, PiP, and native media events.
- [x] Add HLS adapter with HLS.js/native fallback and exposed quality levels.
- [x] Add YouTube/Plyr adapter using parsed video IDs and `origin`.
- [x] Add adapter-level tests for deterministic helper logic.
- [x] Lazy-load Plyr/HLS.js so media engines are not part of the initial application chunk.
- [x] Add normal `youtube.com` Premium-session mode plus `youtube-nocookie.com` privacy mode.

### Task 3: Unified player UI

- [x] Replace the placeholder with a URL launcher + real player viewport.
- [x] Route source entry actions to the same controller.
- [x] Show loading, ready, playing, paused, ended, and error states.
- [x] Show HLS quality choices when levels are available.
- [x] Preserve P1 responsive behavior across desktop/tablet/phone/landscape.
- [x] Add YouTube channel/@handle live resolution and quick actions for Halk TV and ANKA Haber.
- [x] Clear the previous adapter before channel resolution so offline channels cannot leave stale playback behind.
- [x] Poll configured YouTube channels for live/offline state and current live title metadata.
- [x] Retry one transient resolver failure and use `videoDetails.isLiveContent` as a canonical-metadata fallback.
- [x] Treat blocked/consent/unexpected YouTube HTML as a resolver error instead of falsely reporting the channel offline.

### Task 4: Browser acceptance

- [x] Verify direct media playback with a public test MP4.
- [x] Verify HLS playback with a public test manifest.
- [x] Verify YouTube embed creation with a public test video.
- [x] Verify source switching and cleanup.
- [x] Verify Halk TV `/live` resolution and ANKA offline handling through the real API/YouTube response.
- [x] Click the resolved Halk TV player and verify the YouTube IFrame/Plyr state actually changes to `playing`/Pause with a live seek position.
- [x] Verify Premium-session mode produces a normal `youtube.com` iframe and privacy mode produces `youtube-nocookie.com`.
- [x] Check desktop and phone layouts for horizontal overflow and player usability.

### Task 5: Exit verification and documentation

- [x] Update README with P2 behavior and source support.
- [x] Run full repository verification and Docker acceptance.
- [ ] Commit and push P2.

## Exit Criteria

- [x] YouTube URL, HLS URL, and supported direct media all open from the same LiveTV player screen.
- [x] Source switches do not leave stale player instances behind.
- [x] Playback errors are visible and actionable.
- [x] Fullscreen and PiP are available when browser/provider capabilities allow them.
- [x] HLS quality selection appears when HLS.js exposes multiple levels.
- [x] Responsive P1 acceptance remains intact.
- [x] YouTube channel URLs can follow the current live broadcast without pinning a stale video ID.
- [x] YouTube Premium session mode is available without ad-bypass logic.
