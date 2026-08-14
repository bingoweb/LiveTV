# LiveTV Simple Watch UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-section LiveTV dashboard with one premium, minimal URL-to-player experience: paste an internet media URL, press **Yükle ve İzle**, and watch.

**Architecture:** `App` becomes a single static shell and mounts only a simplified `UnifiedPlayer`. The player keeps the existing `PlayerController`, browser adapters, automatic source detection, and YouTube live-channel recovery, while removing route, library, source-engine, Premium-toggle, quality, featured-channel, and secondary-page UI dependencies. Earlier IPTV/Torrent/Guide/Library files remain dormant in the repository but are no longer imported by the application entry path.

**Tech Stack:** React 19, TypeScript, Vite, `@livetv/player-core`, existing browser player adapters, Fastify YouTube live resolver, Vitest.

## Global Constraints

- The visible app has one screen and no navigation or advanced menu.
- Input is URL-only; local file playback is not added.
- HTTP(S) direct media, HLS/M3U8, YouTube watch URLs, and YouTube channel/handle live URLs remain automatically supported.
- The existing YouTube session-aware embed behavior remains internal; no Premium setting is exposed.
- Do not expose manual engine selection, manual quality selection, playlist/history/library actions, IPTV, Torrent, Guide, or Settings UI.
- Keep the existing playback engines and YouTube resolver behavior rather than replacing them.
- Mobile uses the same hierarchy with stacked URL/action controls and a full-width 16:9 player.

---

### Task 1: Collapse the application shell to one watch surface

**Files:**

- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**

- Consumes: `UnifiedPlayer` with no route-specific application coordination.
- Produces: one static `<App />` shell containing brand copy and the player.

- [ ] **Step 1: Replace the route-shell tests with a failing simple-shell contract.** The new test must assert that `renderToStaticMarkup(<App />)` contains `LiveTV`, `Yükle ve İzle`, and `unified-player`, and does not contain `Ana navigasyon`, `mobile-bottom-nav`, `IPTV / M3U kütüphanesi`, `TV rehberi`, `Torrent`, `Playlistler`, `Geçmiş`, `Ayarlar`, or phase copy such as `P6`.

```tsx
const markup = renderToStaticMarkup(<App />)
expect(markup).toContain('LiveTV')
expect(markup).toContain('Yükle ve İzle')
expect(markup).toContain('unified-player')
expect(markup).not.toContain('Ana navigasyon')
expect(markup).not.toContain('Ayarlar')
```

- [ ] **Step 2: Run the App test and confirm RED** because the current shell still renders navigation, routes, providers, and phase UI.

Run: `npx vitest run apps/web/src/App.test.tsx`

- [ ] **Step 3: Simplify `App.tsx`.** Remove Navigation, RouteContent, SettingsShell, route resolution, history/popstate state, IPTV/Guide/Torrent/Library providers, and playback request coordination. Render one shell:

```tsx
export function App() {
  return (
    <div className="simple-watch-app">
      <a className="skip-link" href="#main-content">
        İçeriğe geç
      </a>
      <header className="simple-watch-header">
        <a
          className="simple-watch-brand"
          href="/"
          aria-label="LiveTV ana sayfa"
        >
          LiveTV
        </a>
      </header>
      <main id="main-content" className="simple-watch-main" tabIndex={-1}>
        <UnifiedPlayer />
      </main>
    </div>
  )
}
```

- [ ] **Step 4: Run App tests and web typecheck; confirm GREEN.**

Run: `npx vitest run apps/web/src/App.test.tsx && npm run typecheck -w @livetv/web`

- [ ] **Step 5: Commit** with `refactor: collapse LiveTV to single watch shell`.

---

### Task 2: Simplify UnifiedPlayer to URL → automatic playback

**Files:**

- Modify: `apps/web/src/components/UnifiedPlayer.tsx`
- Create: `apps/web/src/components/UnifiedPlayer.test.tsx`

**Interfaces:**

- Consumes: `PlayerController`, `createBrowserAdapterFactories`, `parseYouTubeChannelReference`, `loadYouTubeChannelWithRecovery`.
- Produces: `UnifiedPlayer(): JSX.Element` with one URL field and one primary submit action.

- [ ] **Step 1: Write failing static-markup tests** proving the player contains `Medya URL’si`, `Yükle ve İzle`, and the viewport, while excluding `Motor`, `Premium`, `Kalite`, `Favoriye ekle`, `Yeni playlist`, `Canlı yayınlar`, `Halk TV`, `ANKA Haber`, file inputs, and route-specific helper copy.

```tsx
const markup = renderToStaticMarkup(<UnifiedPlayer />)
expect(markup).toContain('Medya URL’si')
expect(markup).toContain('Yükle ve İzle')
expect(markup).not.toContain('Motor')
expect(markup).not.toContain('Premium')
expect(markup).not.toContain('type="file"')
```

- [ ] **Step 2: Run the new test and confirm RED.**

Run: `npx vitest run apps/web/src/components/UnifiedPlayer.test.tsx`

- [ ] **Step 3: Remove route/library/settings UI dependencies from `UnifiedPlayer`.** Delete `useLibrary`, `LibrarySourceActions`, navigation types, featured-channel polling/buttons, manual source preference state/control, Premium toggle state/control, manual quality UI, footer session controls, and `openRequest` handling. Keep the controller lifecycle, automatic loading, state/error updates, and media host.

- [ ] **Step 4: Keep automatic YouTube live recovery with fixed automatic source preference.** `openSource` must always use `auto`; channel/handle URLs continue through `loadYouTubeChannelWithRecovery`. Browser adapters should receive an internal YouTube mode getter returning the existing session-aware mode without exposing a UI toggle.

```ts
const nextSource = channelReference
  ? await loadYouTubeChannelWithRecovery(
      requestedUrl,
      resolveYouTubeChannelLive,
      (playableUrl) => controller.load(playableUrl, 'auto'),
    )
  : await controller.load(requestedUrl, 'auto')
```

- [ ] **Step 5: Render only the minimal interaction hierarchy.** Use one title/subtitle, one URL input row, primary button text `Yükle ve İzle` / `Yükleniyor…`, one status chip, 16:9 viewport, and inline error banner. Empty-state copy should be concise: `İzlemek istediğin bağlantıyı yapıştır.`

- [ ] **Step 6: Run focused player/App/player-core/YouTube recovery tests and typecheck.**

Run: `npx vitest run apps/web/src/components/UnifiedPlayer.test.tsx apps/web/src/App.test.tsx apps/web/src/player/youtube-live-recovery.test.ts packages/player-core/test/source.test.ts packages/player-core/test/controller.test.ts && npm run typecheck -w @livetv/web`

- [ ] **Step 7: Commit** with `refactor: simplify player to load and watch`.

---

### Task 3: Replace dashboard CSS with cinematic simple-watch layout

**Files:**

- Modify: `apps/web/src/styles.css`
- Modify: `tests/responsive-css.test.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: `.simple-watch-app`, `.simple-watch-header`, `.simple-watch-main`, `.simple-watch-brand`, `.unified-player`, `.player-source-form`, `.player-source-input-row`, `.unified-player-viewport`.
- Produces: centered desktop layout and stacked mobile layout without sidebar/bottom-nav dependencies.

- [ ] **Step 1: Replace responsive regression expectations with RED tests** for the simple watch UI. Require a centered max-width main container, `aspect-ratio: 16 / 9` on the player viewport, and at `max-width: 768px` a single-column `.player-source-input-row`.

```ts
expect(css).toMatch(
  /\.unified-player-viewport\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9;/s,
)
expect(css).toMatch(
  /@media \(max-width: 768px\)[\s\S]*?\.player-source-input-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
)
```

- [ ] **Step 2: Run responsive tests and confirm RED** against the old dashboard stylesheet.

Run: `npx vitest run tests/responsive-css.test.ts`

- [ ] **Step 3: Add a final simple-watch CSS override section** that neutralizes the old shell layout and styles only the new visible classes: dark cinematic page, compact header, centered max-width content, restrained input card, high-emphasis primary button, 16:9 viewport, quiet status/error treatment, and mobile stacking. Do not spend this task deleting every dormant historical selector.

- [ ] **Step 4: Update README current-product description** so the first-run experience is documented as URL → **Yükle ve İzle** and earlier P3–P6 modules are described as retained internal/dormant code rather than visible navigation.

- [ ] **Step 5: Run App/player/responsive tests, web typecheck, and production build.**

Run: `npx vitest run apps/web/src/App.test.tsx apps/web/src/components/UnifiedPlayer.test.tsx tests/responsive-css.test.ts && npm run typecheck -w @livetv/web && npm run build -w @livetv/web`

- [ ] **Step 6: Commit** with `style: streamline LiveTV watch experience`.

---

### Task 4: Full verification and browser acceptance

**Files:**

- Modify: `docs/superpowers/plans/2026-08-14-simple-watch-ui.md` for evidence/checkmarks only.

**Interfaces:**

- Consumes: final simple-watch application.
- Produces: verified branch ready for PR/merge.

- [ ] **Step 1: Run full local gate.** `npm run verify`, `git diff --check`, `docker compose config`, tracked Google API-key-pattern scan, `.env` ignored proof.

- [ ] **Step 2: Rebuild Docker stack** while preserving `YOUTUBE_DATA_API_KEY` process-to-process without printing it; verify root/API/media health return HTTP 200.

- [ ] **Step 3: Browser desktop acceptance in a clean context.** Verify the page shows only brand + URL input + `Yükle ve İzle` + player; no navigation, settings, IPTV, Torrent, Guide, History, Playlist, Premium, Motor, Quality, or local-file control is visible.

- [ ] **Step 4: Browser playback acceptance.** Load the deterministic local HTTP media fixture by URL and prove the existing viewport reaches playable/ended state with no media error. Load a YouTube watch/channel URL and prove automatic YouTube path still initializes or resolves without exposing settings.

- [ ] **Step 5: Browser mobile acceptance.** Use a narrow viewport, prove URL/button stack vertically, viewport remains full width/16:9, and no horizontal application overflow appears.

- [ ] **Step 6: Clean console acceptance.** In a separate fresh browser context, reload the simple watch screen and confirm zero application `error`, `warn`, and `issue` console messages.

- [ ] **Step 7: Record evidence and commit** with `chore: complete simple watch UI milestone`.

- [ ] **Step 8: Push as `feat/simple-watch-ui`, open PR to `main`, wait for `verify` and `dependency-review`, merge when green, delete the feature branch, fast-forward local main while preserving ignored `.env`, and run final `npm ci` + full `npm run verify` + GitHub push-CI on the final pushed main SHA.

## Exit Criteria

- [ ] One visible screen: URL → `Yükle ve İzle` → player.
- [ ] No visible navigation, advanced menu, Settings, IPTV, Torrent, Guide, History, Playlist, or library UI.
- [ ] No local-file selector.
- [ ] No manual engine, Premium, or quality controls.
- [ ] Automatic direct/HLS/YouTube source detection still works.
- [ ] YouTube channel/handle live recovery remains functional.
- [ ] Desktop and mobile layouts are clean, centered, and responsive.
- [ ] Full local verification, Docker/browser acceptance, PR CI, merge, and final-main verification pass.
