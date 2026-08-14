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

- [x] **Step 1: Replace the route-shell tests with a failing simple-shell contract.** RED confirmed against the old navigation/dashboard shell.

```tsx
const markup = renderToStaticMarkup(<App />)
expect(markup).toContain('LiveTV')
expect(markup).toContain('Yükle ve İzle')
expect(markup).toContain('unified-player')
expect(markup).not.toContain('Ana navigasyon')
expect(markup).not.toContain('Ayarlar')
```

- [x] **Step 2: Run the App test and confirm RED.**

Run: `npx vitest run apps/web/src/App.test.tsx`

- [x] **Step 3: Simplify `App.tsx`.** Navigation, route coordination, secondary providers, and playback orchestration were removed from the visible application entry path.

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

- [x] **Step 4: Run App tests and web typecheck; confirm GREEN.**

Run: `npx vitest run apps/web/src/App.test.tsx && npm run typecheck -w @livetv/web`

- [x] **Step 5: Commit** with `refactor: collapse LiveTV to single watch shell` (`8aad02a`).

---

### Task 2: Simplify UnifiedPlayer to URL → automatic playback

**Files:**

- Modify: `apps/web/src/components/UnifiedPlayer.tsx`
- Create: `apps/web/src/components/UnifiedPlayer.test.tsx`

**Interfaces:**

- Consumes: `PlayerController`, `createBrowserAdapterFactories`, `parseYouTubeChannelReference`, `loadYouTubeChannelWithRecovery`.
- Produces: `UnifiedPlayer(): JSX.Element` with one URL field and one primary submit action.

- [x] **Step 1: Write failing static-markup tests** proving the simple controls and absence of advanced/library/local-file UI.

```tsx
const markup = renderToStaticMarkup(<UnifiedPlayer />)
expect(markup).toContain('Medya URL’si')
expect(markup).toContain('Yükle ve İzle')
expect(markup).not.toContain('Motor')
expect(markup).not.toContain('Premium')
expect(markup).not.toContain('type="file"')
```

- [x] **Step 2: Run the new test and confirm RED.** Initial failure proved the old LibraryProvider dependency was still active.

Run: `npx vitest run apps/web/src/components/UnifiedPlayer.test.tsx`

- [x] **Step 3: Remove route/library/settings UI dependencies from `UnifiedPlayer`.**

- [x] **Step 4: Keep automatic YouTube live recovery with fixed automatic source preference.** The existing session-aware embed mode remains internal. The brittle Plyr default-export type bridge was also replaced with the actual `export =` constructor shape after TypeScript exposed it during this task.

```ts
const nextSource = channelReference
  ? await loadYouTubeChannelWithRecovery(
      requestedUrl,
      resolveYouTubeChannelLive,
      (playableUrl) => controller.load(playableUrl, 'auto'),
    )
  : await controller.load(requestedUrl, 'auto')
```

- [x] **Step 5: Render only the minimal interaction hierarchy.**

- [x] **Step 6: Run focused player/App/player-core/YouTube recovery tests and typecheck.** Evidence: 17/17 focused tests pass and web typecheck exits 0.

Run: `npx vitest run apps/web/src/components/UnifiedPlayer.test.tsx apps/web/src/App.test.tsx apps/web/src/player/youtube-live-recovery.test.ts packages/player-core/test/source.test.ts packages/player-core/test/controller.test.ts && npm run typecheck -w @livetv/web`

- [x] **Step 7: Commit** with `refactor: simplify player to load and watch` (`ef451fe`).

---

### Task 3: Replace dashboard CSS with cinematic simple-watch layout

**Files:**

- Modify: `apps/web/src/styles.css`
- Modify: `tests/responsive-css.test.ts`
- Modify: `README.md`

**Interfaces:**

- Consumes: `.simple-watch-app`, `.simple-watch-header`, `.simple-watch-main`, `.simple-watch-brand`, `.unified-player`, `.player-source-form`, `.player-source-input-row`, `.unified-player-viewport`.
- Produces: centered desktop layout and stacked mobile layout without sidebar/bottom-nav dependencies.

- [x] **Step 1: Replace responsive regression expectations with RED tests** for centered 16:9 desktop and stacked mobile controls.

```ts
expect(css).toMatch(
  /\.unified-player-viewport\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9;/s,
)
expect(css).toMatch(
  /@media \(max-width: 768px\)[\s\S]*?\.player-source-input-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
)
```

- [x] **Step 2: Run responsive tests and confirm RED** against the old dashboard stylesheet.

Run: `npx vitest run tests/responsive-css.test.ts`

- [x] **Step 3: Add a final simple-watch CSS override section** for the cinematic single-screen surface and mobile stacking.

- [x] **Step 4: Update README current-product description** to the new load-and-watch product boundary.

- [x] **Step 5: Run App/player/responsive tests, web typecheck, and production build.** Evidence: 4/4 focused UI tests pass; web build succeeds and the initial app JS shrinks from roughly 386 kB to 204 kB while HLS remains lazy.

Run: `npx vitest run apps/web/src/App.test.tsx apps/web/src/components/UnifiedPlayer.test.tsx tests/responsive-css.test.ts && npm run typecheck -w @livetv/web && npm run build -w @livetv/web`

- [x] **Step 6: Commit** with `style: streamline LiveTV watch experience` (`972b41e`). The dormant P5 wiring regression was updated in `fb65018` so old torrent code remains present but is intentionally outside App/UnifiedPlayer.

---

### Task 4: Full verification and browser acceptance

**Files:**

- Modify: `docs/superpowers/plans/2026-08-14-simple-watch-ui.md` for evidence/checkmarks only.

**Interfaces:**

- Consumes: final simple-watch application.
- Produces: verified branch ready for PR/merge.

- [x] **Step 1: Run full local gate.** Evidence: 54 Vitest files / 229 tests pass; formatting, ESLint, all typechecks/builds, 21-dependency license policy, diff check, Compose config, tracked Google API-key scan, and `.env` ignore proof are clean.

- [x] **Step 2: Rebuild Docker stack** while preserving `YOUTUBE_DATA_API_KEY` process-to-process without printing it. Root, API, and media health return HTTP 200 after startup.

- [x] **Step 3: Browser desktop acceptance in a clean context.** The accessibility tree contains only brand, URL field, one `Yükle ve İzle` action, status, and player; all removed product controls are absent.

- [x] **Step 4: Browser playback acceptance.** A generated 4.008-second VP9/Opus WebM reached `readyState=4`, played with no media error, and a pasted `https://www.youtube.com/@Halktvkanali` URL automatically resolved to the active live YouTube embed without settings UI.

- [x] **Step 5: Browser mobile acceptance.** At 390×844, document width equals viewport width (no horizontal overflow), controls are one column, and the viewport measures 360×202.5 (16:9).

- [x] **Step 6: Clean console acceptance.** Separate isolated context reports zero `error`, zero `warn`, and zero `issue` console messages.

- [x] **Step 7: Record evidence and commit** with `chore: complete simple watch UI milestone` (`ce6d9b0`).

- [ ] **Step 8: Integration and final-main verification.** `feat/simple-watch-ui` was pushed and PR #10 opened. `dependency-review` passed in 8 seconds and `verify` passed in 42 seconds. PR #10 merged cleanly as `3a86d8417c46c40ac722080b171fbc08ab5ad3f8`; local `main` fast-forwarded to `origin/main`, the feature branch was requested for deletion, and ignored `.env` still contains the configured YouTube key. Final `npm ci` + full `npm run verify` + push-CI on the final documentation SHA remain before closure.

## Exit Criteria

- [x] One visible screen: URL → `Yükle ve İzle` → player.
- [x] No visible navigation, advanced menu, Settings, IPTV, Torrent, Guide, History, Playlist, or library UI.
- [x] No local-file selector.
- [x] No manual engine, Premium, or quality controls.
- [x] Automatic direct/HLS/YouTube source detection still works.
- [x] YouTube channel/handle live recovery remains functional.
- [x] Desktop and mobile layouts are clean, centered, and responsive.
- [ ] Full local verification, Docker/browser acceptance, PR CI, merge, and final-main verification pass.
