# P1 Responsive UI Shell + PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the first real LiveTV application shell across desktop, tablet, and phone, with navigation, player/settings placeholders, accessibility foundations, and an installable shell-only PWA.

**Architecture:** Keep P1 media-engine independent. The React web app owns navigation and responsive presentation; route metadata stays pure/testable; PWA assets live under `apps/web/public`; the service worker only caches the application shell and same-origin static assets, never API/media traffic.

**Tech Stack:** React 19, TypeScript 6, Vite 8, CSS custom properties/media queries, Web App Manifest, Service Worker API, Vitest.

## Global Constraints

- Desktop: left navigation, content/library context, large player area, optional contextual panel.
- Phone: bottom navigation, large touch targets, safe-area support, portrait/landscape support, secondary actions in a bottom sheet.
- Tablet: two-column library/player layout with a reduced/collapsible navigation rail.
- PWA: standalone manifest, install guidance, update-ready affordance, shell/static cache only.
- Never cache torrent, YouTube, HLS, API, media-worker, or other media payloads for offline use.
- Keep P1 independent of player/media engines and authentication.
- New dependencies are unnecessary for P1; use existing React/Vite platform APIs.

---

### Task 1: Lock navigation and P1 metadata contracts

**Files:**

- Modify: `apps/web/src/app-meta.ts`
- Create: `apps/web/src/navigation.ts`
- Modify: `apps/web/src/app-meta.test.ts`
- Create: `apps/web/src/navigation.test.ts`

**Interfaces:**

- Produces: `navigationItems`, `resolveRoute(pathname)`, and P1 `appMeta` consumed by the shell.

- [x] Write failing tests for P1 metadata, all approved primary routes, and unknown-path fallback.
- [x] Run the focused tests and confirm failure against the P0 shell.
- [x] Implement the minimal route metadata and resolver.
- [x] Re-run focused tests and commit the contract.

### Task 2: Build the responsive application shell

**Files:**

- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/components/AppIcon.tsx`
- Create: `apps/web/src/components/Navigation.tsx`
- Create: `apps/web/src/components/PlayerPlaceholder.tsx`
- Create: `apps/web/src/components/RouteContent.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**

- Consumes: `navigationItems`, `resolveRoute(pathname)`.
- Produces: semantic desktop sidebar, tablet rail/layout, mobile bottom navigation/bottom sheet, route content, and player placeholder.

- [x] Replace the P0 rendering test with failing P1 shell/accessibility assertions.
- [x] Implement semantic shell components and route state based on History API.
- [x] Add theme tokens, responsive breakpoints, touch/focus/safe-area/reduced-motion rules.
- [x] Verify route and shell tests.

### Task 3: Add the settings shell and route-specific empty states

**Files:**

- Create: `apps/web/src/components/SettingsShell.tsx`
- Modify: `apps/web/src/components/RouteContent.tsx`
- Modify: `apps/web/src/App.test.tsx`

**Interfaces:**

- Produces: P1-only settings structure without introducing P3 persistence.

- [x] Add failing assertions for `/settings` and key source routes.
- [x] Implement useful P1 placeholders for source entry, library context, and settings categories.
- [x] Verify focused tests.

### Task 4: Add installable shell-only PWA behavior

**Files:**

- Modify: `apps/web/index.html`
- Create: `apps/web/public/manifest.webmanifest`
- Create: `apps/web/public/sw.js`
- Create: `apps/web/public/icons/livetv.svg`
- Create: `apps/web/src/pwa/install.ts`
- Create: `apps/web/src/pwa/register-service-worker.ts`
- Create: `apps/web/src/components/PwaStatus.tsx`
- Modify: `apps/web/src/main.tsx`
- Create: `tests/pwa-assets.test.ts`
- Create: `apps/web/public/icons/livetv-192.png`
- Create: `apps/web/public/icons/livetv-512.png`

**Interfaces:**

- Produces: manifest/install metadata, SW registration, install prompt state, and update-ready reload action.

- [x] Add a failing asset-contract test for manifest and service-worker cache exclusions.
- [x] Add manifest, icon, service worker, registration, and install/update UI.
- [x] Verify focused PWA tests and production build output.

### Task 5: Browser acceptance across desktop/tablet/phone

**Files:**

- No production file required unless browser acceptance exposes a defect.

- [x] Run LiveTV locally through the normal Docker/Caddy entry point.
- [x] Verify desktop navigation/player composition.
- [x] Verify tablet two-column composition and reduced navigation rail.
- [x] Verify phone bottom navigation, safe-area behavior, and secondary bottom sheet.
- [x] Check console/network errors and confirm manifest/service-worker availability.
- [x] Verify short-screen phone landscape uses a full-width player; add a regression test for the discovered grid defect.

### Task 6: P1 exit verification and documentation

**Files:**

- Modify: `README.md`
- Modify: this plan as tasks are completed.

- [x] Run `npm run verify`.
- [x] Run repository structure regression test.
- [x] Run Docker Compose health checks and Caddy endpoints.
- [x] Update README from P0 status to P1 shell status and document PWA development behavior.
- [x] Commit P1 and push `main` to `origin`.

## P1 Exit Criteria

- [x] Desktop sidebar navigation works.
- [x] Tablet split layout works.
- [x] Mobile bottom navigation and secondary bottom sheet work.
- [x] Every approved top-level section has a route shell.
- [x] Player placeholder and settings shell are present.
- [x] Keyboard focus, skip-link, semantic landmarks, and reduced-motion support are present.
- [x] Web manifest is served and standalone-capable.
- [x] Service worker registers and excludes API/media traffic from caching.
- [x] Install/update affordances are wired to browser capabilities.
- [x] Full repository verification and Docker acceptance pass.
