# LiveTV Simple Watch UI Design

## Goal

Reduce LiveTV to a single-purpose viewing surface: paste an internet media URL, press **Yükle ve İzle**, and watch it in the existing unified player.

## Product surface

The visible application has one screen only. It contains a compact LiveTV brand header, one URL input, one primary **Yükle ve İzle** button, the existing media viewport, a small playback-state label, and a short inline error message when loading fails.

The following UI surfaces are removed from the application shell: desktop/mobile navigation, Home source cards, IPTV library, Torrent workspace, TV Guide, History, Playlists, Settings, phase/status cards, library actions, source-engine selector, YouTube Premium toggle, manual quality selector, featured YouTube channel buttons, and all route-specific context panels.

No hidden or secondary advanced menu is provided. The removed sections are not reachable from navigation.

## Input boundary

The only user input is an internet URL. Local file selection is not supported.

Automatic source detection remains responsible for HTTP(S) direct video/audio URLs, HLS/M3U8 URLs, YouTube watch URLs, and YouTube channel/handle live URLs. The existing YouTube live-resolution API remains available behind the player when a channel URL needs resolution.

The player always uses automatic source selection. YouTube uses the existing browser session/Premium-aware embed behavior internally without exposing a setting.

## Application architecture

`App` becomes a single static shell rather than a route coordinator. It no longer mounts Navigation, RouteContent, SettingsShell, IPTV/Guide/Torrent providers, or library playback orchestration.

`UnifiedPlayer` is simplified into the single watch experience. It keeps the existing PlayerController, browser adapters, YouTube channel recovery, loading/error/state handling, and normal playback controls provided by the media engine. It no longer depends on navigation state or the personal library.

The existing P3–P6 implementation files may remain in the repository for now, but they are dormant and must not be imported by the new application entry path. This keeps the change focused and reversible while reducing the user-visible and startup surface.

## Interaction flow

1. User opens LiveTV and immediately sees the URL field and player.
2. User pastes a supported internet URL.
3. Pressing **Yükle ve İzle** starts automatic source detection and loading.
4. During load, the primary button/status shows a concise loading state.
5. On success, the media fills the main viewport and standard play/pause/seek controls remain available through the existing playback adapter.
6. On failure, the URL remains in the field and a short inline error message is shown; no settings or engine-selection recovery UI is exposed.

## Visual direction

The page should feel premium but quiet: dark cinematic background, generous whitespace, a centered content column, one high-emphasis action, restrained borders/shadows, and a large 16:9 viewing surface. No dashboard cards, dense sidebars, phase badges, or explanatory clutter.

Desktop and mobile use the same hierarchy. On narrow screens the input and primary button stack vertically; the player remains full-width and 16:9.

## Error and fallback behavior

Source parsing and playback errors use the existing Turkish error messages where practical. YouTube channel URLs continue to attempt the official live resolver first and its existing fallback behavior remains server-side. No new retry/configuration surface is added.

## Testing

Tests must prove that the app renders one simple watch surface, removed navigation/settings/library controls are absent, URL submission calls automatic playback, YouTube live-channel resolution still works, local-file controls are absent, responsive CSS preserves the one-column mobile flow, and existing player-core/API tests remain green.

## Out of scope

This redesign does not delete the persisted IndexedDB databases or backend endpoints from earlier phases, migrate old user data, add local-file playback, add authentication, or redesign the playback engines themselves.
