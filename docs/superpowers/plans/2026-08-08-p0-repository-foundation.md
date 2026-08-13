# LiveTV P0 Repository Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible LiveTV monorepo foundation that can be developed and verified from one root workspace, exposes minimal web/API/media-worker services, includes PostgreSQL and Caddy development infrastructure, and passes CI-quality lint/typecheck/test/build checks.

**Architecture:** Use npm workspaces with one lockfile and a single TypeScript toolchain. `apps/web` is a Vite + React application, `apps/api` and `services/media-worker` are independent Fastify services, and `packages/shared` contains cross-service health-contract code while `packages/player-core` is a deliberately minimal package boundary for later P2 work. Docker Compose runs the three application services, PostgreSQL, and Caddy; Caddy is the development reverse proxy and preserves the same service boundaries planned for production.

**Tech Stack:** Node.js 24 LTS for CI/containers, npm workspaces, TypeScript, React, Vite, Fastify, Vitest, ESLint flat config, Prettier, PostgreSQL 18, Docker Compose, Caddy, GitHub Actions.

## Global Constraints

- The binding design is `LiveTV-Proje-Tasarim-ve-Yol-Haritasi.md`, dated 8 August 2026 and marked “Tasarım onaylandı”.
- Target deployment remains a normal web application/PWA at `player.taylansoylu.com`; no native desktop/mobile application is introduced in P0.
- Phone and tablet remain first-class product targets; P0 must not introduce a desktop-only architectural assumption.
- The repository target is public GitHub repository `bingoweb/LiveTV` on branch `main`.
- Main project components remain free and open source; every new dependency must have its license checked before commit.
- No YouTube Data API, Google API key, YouTube search, recording, download feature, permanent torrent archive, seeding mode, social login, DRM bypass, geo-restriction bypass, anonymous media proxy, or anonymous server torrent fallback may be introduced.
- P0 does not implement media playback, auth, IPTV, torrent streaming, proxying, or business persistence; it only creates tested service boundaries and infrastructure.
- Node.js 24 is the canonical CI/container runtime for P0; local Node 22.12+ remains allowed so the current workstation Node 22.23.1 can run the workspace.
- Use one root `package-lock.json`; CI installs with `npm ci`.
- Keep files focused by responsibility and avoid early abstractions unrelated to P0.

---

## Planned File Structure

```text
LiveTV/
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml
│       └── dependency-review.yml
├── apps/
│   ├── api/
│   │   ├── src/app.ts
│   │   ├── src/index.ts
│   │   ├── test/health.test.ts
│   │   ├── Dockerfile.dev
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/
│       ├── src/App.tsx
│       ├── src/app-meta.ts
│       ├── src/app-meta.test.ts
│       ├── src/main.tsx
│       ├── index.html
│       ├── Dockerfile.dev
│       ├── package.json
│       ├── tsconfig.app.json
│       ├── tsconfig.node.json
│       └── vite.config.ts
├── services/
│   └── media-worker/
│       ├── src/app.ts
│       ├── src/index.ts
│       ├── test/health.test.ts
│       ├── Dockerfile.dev
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── player-core/
│   │   ├── src/index.ts
│   │   ├── test/package.test.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── shared/
│       ├── src/health.ts
│       ├── src/index.ts
│       ├── test/health.test.ts
│       ├── package.json
│       └── tsconfig.json
├── infra/
│   └── reverse-proxy/
│       └── Caddyfile
├── scripts/
│   ├── dev.mjs
│   └── check-licenses.mjs
├── tests/
│   └── repository-structure.node.mjs
├── .dockerignore
├── .editorconfig
├── .env.example
├── .gitignore
├── .nvmrc
├── .prettierignore
├── .prettierrc.json
├── compose.yaml
├── eslint.config.js
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.base.json
```

---

### Task 1: Initialize Git, npm workspaces, and repository-wide quality gates

**Files:**

- Create: `.gitignore`
- Create: `.dockerignore`
- Create: `.editorconfig`
- Create: `.env.example`
- Create: `.nvmrc`
- Create: `.prettierignore`
- Create: `.prettierrc.json`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `eslint.config.js`
- Create: `scripts/dev.mjs`
- Create: `tests/repository-structure.node.mjs`
- Create: initial workspace `package.json`/`tsconfig.json` files under `apps/*`, `services/*`, and `packages/*`

**Interfaces:**

- Consumes: binding LiveTV design and the empty local project directory.
- Produces: npm workspace names `@livetv/web`, `@livetv/api`, `@livetv/media-worker`, `@livetv/shared`, `@livetv/player-core`; root scripts `dev`, `lint`, `format`, `format:check`, `typecheck`, `test`, `build`, `verify`, `licenses:check`.

- [ ] **Step 1: Initialize the Git repository on `main`**

Run:

```bash
git init -b main
```

Expected: `.git/` exists and `git branch --show-current` prints `main` after the first commit.

- [ ] **Step 2: Create the root workspace manifest before installing dependencies**

Create `package.json` with this contract:

```json
{
  "name": "livetv",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22.12.0 <27" },
  "workspaces": ["apps/*", "services/*", "packages/*"],
  "scripts": {
    "dev": "node scripts/dev.mjs",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "vitest run",
    "build": "npm run build --workspaces --if-present",
    "licenses:check": "node scripts/check-licenses.mjs",
    "verify": "npm run format:check && npm run lint && npm run typecheck && npm test && npm run build && npm run licenses:check"
  }
}
```

- [ ] **Step 3: Add a failing structure test**

Create `tests/repository-structure.node.mjs` using Node assertions to require these paths: `apps/web/package.json`, `apps/api/package.json`, `services/media-worker/package.json`, `packages/shared/package.json`, `packages/player-core/package.json`, `compose.yaml`, and `infra/reverse-proxy/Caddyfile`.

Run:

```bash
node --test tests/repository-structure.node.mjs
```

Expected: FAIL because required P0 paths do not all exist yet.

- [ ] **Step 4: Create workspace manifests and shared configuration**

Each workspace package must be `private: true`, use ESM, and expose `build`, `typecheck`, and test behavior appropriate to that workspace. Create `tsconfig.base.json` with strict TypeScript settings (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `forceConsistentCasingInFileNames`, `skipLibCheck`) and Node/DOM libraries only where the workspace needs them.

- [ ] **Step 5: Add development orchestration without a concurrency dependency**

Create `scripts/dev.mjs` with `node:child_process.spawn` so one `npm run dev` starts the `web`, `api`, and `media-worker` workspace dev scripts concurrently, forwards stdio, and terminates sibling processes on SIGINT/SIGTERM.

- [ ] **Step 6: Install the root development toolchain and commit the lockfile**

Run:

```bash
npm install -D typescript vitest eslint @eslint/js typescript-eslint globals prettier tsx @types/node
```

Expected: root `package-lock.json` is generated.

- [ ] **Step 7: Configure ESLint and Prettier, then run the current quality checks**

Run:

```bash
npm run format
npm run lint
node --test tests/repository-structure.node.mjs
```

Expected: lint passes; structure test may still fail only for artifacts intentionally produced by later tasks.

- [ ] **Step 8: Commit the repository foundation**

```bash
git add .
git commit -m "chore: initialize LiveTV monorepo foundation"
```

---

### Task 2: Add shared health contract and the minimal web application

**Files:**

- Create: `packages/shared/src/health.ts`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/test/health.test.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/app-meta.ts`
- Create: `apps/web/src/app-meta.test.ts`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.app.json`
- Create: `apps/web/tsconfig.node.json`
- Modify: `apps/web/package.json`
- Modify: `packages/shared/package.json`

**Interfaces:**

- Consumes: npm workspace and TypeScript root configuration from Task 1.
- Produces: `ServiceHealth` type and `createServiceHealth(service)` function from `@livetv/shared`; a buildable Vite React app that identifies itself as LiveTV without implementing P1 UI.

- [ ] **Step 1: Write the failing shared-package health test**

Test contract:

```ts
expect(createServiceHealth('api')).toEqual({
  service: 'api',
  status: 'ok',
})
```

Run:

```bash
npx vitest run packages/shared/test/health.test.ts
```

Expected: FAIL because `createServiceHealth` does not exist.

- [ ] **Step 2: Implement the minimal health contract**

Implement:

```ts
export type ServiceHealth = {
  service: string
  status: 'ok'
}

export function createServiceHealth(service: string): ServiceHealth {
  return { service, status: 'ok' }
}
```

Run the shared test again and expect PASS.

- [ ] **Step 3: Write a failing web metadata test**

`apps/web/src/app-meta.test.ts` must assert that the exported metadata has `name: 'LiveTV'` and `phase: 'P0'`.

Run:

```bash
npx vitest run apps/web/src/app-meta.test.ts
```

Expected: FAIL before `app-meta.ts` exists.

- [ ] **Step 4: Scaffold the smallest React/Vite shell needed for P0**

Install only runtime dependencies required now:

```bash
npm install react react-dom --workspace @livetv/web
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom --workspace @livetv/web
```

`App.tsx` must render only a semantic `<main>` with the product name and a “P0 foundation” status; no P1 navigation, player, theme system, or responsive product design is implemented yet.

- [ ] **Step 5: Verify the web workspace**

Run:

```bash
npm run typecheck --workspace @livetv/web
npx vitest run apps/web/src/app-meta.test.ts
npm run build --workspace @livetv/web
```

Expected: all PASS and `apps/web/dist/` is produced.

- [ ] **Step 6: Commit the shared contract and web shell**

```bash
git add packages/shared apps/web package.json package-lock.json
git commit -m "feat: add P0 web and shared workspace skeletons"
```

---

### Task 3: Add independently testable Fastify API and media-worker service boundaries

**Files:**

- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/index.ts`
- Create: `apps/api/test/health.test.ts`
- Modify: `apps/api/package.json`
- Create: `services/media-worker/src/app.ts`
- Create: `services/media-worker/src/index.ts`
- Create: `services/media-worker/test/health.test.ts`
- Modify: `services/media-worker/package.json`

**Interfaces:**

- Consumes: `createServiceHealth()` from `@livetv/shared`.
- Produces: `buildApi()` with `GET /api/health`; `buildMediaWorker()` with `GET /media/health`; executable service entry points listening on `0.0.0.0` and environment-configurable ports.

- [ ] **Step 1: Write the failing API health test**

Test with Fastify injection:

```ts
const app = buildApi()
const response = await app.inject({ method: 'GET', url: '/api/health' })
expect(response.statusCode).toBe(200)
expect(response.json()).toEqual({ service: 'api', status: 'ok' })
await app.close()
```

Run and expect failure before `buildApi()` exists.

- [ ] **Step 2: Install Fastify and implement `buildApi()` minimally**

Run:

```bash
npm install fastify @livetv/shared --workspace @livetv/api
```

`src/index.ts` must read `PORT` with default `3001` and start `buildApi()` on host `0.0.0.0`.

- [ ] **Step 3: Run API test/typecheck/build**

```bash
npx vitest run apps/api/test/health.test.ts
npm run typecheck --workspace @livetv/api
npm run build --workspace @livetv/api
```

Expected: PASS.

- [ ] **Step 4: Write the failing media-worker health test**

The contract mirrors API but uses `/media/health` and `{ service: 'media-worker', status: 'ok' }`.

- [ ] **Step 5: Implement the minimal media-worker HTTP boundary**

Run:

```bash
npm install fastify @livetv/shared --workspace @livetv/media-worker
```

`src/index.ts` must read `PORT` with default `3002`. Do not add WebTorrent, proxy logic, cache, filesystem writes, authentication, or background jobs in P0.

- [ ] **Step 6: Verify both service workspaces and commit**

```bash
npx vitest run apps/api/test/health.test.ts services/media-worker/test/health.test.ts
npm run typecheck --workspace @livetv/api
npm run typecheck --workspace @livetv/media-worker
npm run build --workspace @livetv/api
npm run build --workspace @livetv/media-worker
git add apps/api services/media-worker package.json package-lock.json
git commit -m "feat: add P0 api and media worker service boundaries"
```

---

### Task 4: Complete the player-core package boundary and repository structure test

**Files:**

- Create: `packages/player-core/src/index.ts`
- Create: `packages/player-core/test/package.test.ts`
- Modify: `packages/player-core/package.json`
- Modify: `tests/repository-structure.node.mjs`

**Interfaces:**

- Consumes: root TypeScript/Vitest tooling.
- Produces: a stable `@livetv/player-core` package boundary with no player implementation, plus a repository-level regression test for all required P0 paths.

- [ ] **Step 1: Write a failing player-core boundary test**

Test only an exported phase constant or version marker, for example `PLAYER_CORE_PHASE === 'P0'`; do not define the P2 `PlayerController` early.

- [ ] **Step 2: Implement the minimal package export**

Create a single typed export and no media dependencies.

- [ ] **Step 3: Update the repository structure test to require all P0 directories/files**

Run:

```bash
node --test tests/repository-structure.node.mjs
npx vitest run packages/player-core/test/package.test.ts
```

Expected: structure test still fails only because Compose/Caddy/CI files are not yet present.

- [ ] **Step 4: Commit the package boundary**

```bash
git add packages/player-core tests/repository-structure.node.mjs
git commit -m "chore: establish player core package boundary"
```

---

### Task 5: Add PostgreSQL, Caddy, and Docker Compose development foundation

**Files:**

- Create: `apps/web/Dockerfile.dev`
- Create: `apps/api/Dockerfile.dev`
- Create: `services/media-worker/Dockerfile.dev`
- Create: `infra/reverse-proxy/Caddyfile`
- Create: `compose.yaml`
- Modify: `.env.example`
- Modify: `tests/repository-structure.node.mjs`

**Interfaces:**

- Consumes: workspace dev scripts and service health routes.
- Produces: Compose services `web`, `api`, `media-worker`, `postgres`, `caddy`; local proxy entry point `http://localhost:${LIVETV_HTTP_PORT:-8080}`; PostgreSQL connection fields from environment.

- [ ] **Step 1: Confirm the structure test fails for Compose/Caddy before implementation**

Run:

```bash
node --test tests/repository-structure.node.mjs
```

Expected: FAIL for `compose.yaml` and/or `infra/reverse-proxy/Caddyfile`.

- [ ] **Step 2: Add development Dockerfiles pinned to Node 24**

Each Dockerfile uses `node:24-alpine`, installs from the root `package-lock.json` with `npm ci`, copies the monorepo sources required by that workspace, and starts only its workspace development command.

- [ ] **Step 3: Add Caddy development routing**

`infra/reverse-proxy/Caddyfile` must implement these routes on `:8080`:

```caddyfile
:8080 {
	handle /api/* {
		reverse_proxy api:3001
	}

	handle /media/* {
		reverse_proxy media-worker:3002
	}

	handle {
		reverse_proxy web:5173
	}
}
```

- [ ] **Step 4: Add Compose with PostgreSQL readiness and service health checks**

Use `postgres:18-alpine`, a named `postgres-data` volume, and `pg_isready` healthcheck. Application services that need PostgreSQL later may declare `depends_on: postgres: condition: service_healthy`; P0 API/media-worker must not pretend to use the database if they do not yet access it.

Expose only development ports documented in `.env.example`. Caddy is the normal browser entry point; direct app ports are allowed for debugging but must not replace Caddy routing.

- [ ] **Step 5: Run static infrastructure checks**

Run:

```bash
node --test tests/repository-structure.node.mjs
grep -q 'postgres:18-alpine' compose.yaml
grep -q 'reverse_proxy api:3001' infra/reverse-proxy/Caddyfile
grep -q 'reverse_proxy media-worker:3002' infra/reverse-proxy/Caddyfile
grep -q 'reverse_proxy web:5173' infra/reverse-proxy/Caddyfile
```

Expected: PASS.

- [ ] **Step 6: Run Docker Compose validation when Docker is available**

Run:

```bash
docker compose config
docker compose up --build -d --wait
curl --fail http://localhost:8080/api/health
curl --fail http://localhost:8080/media/health
curl --fail http://localhost:8080/
docker compose down
```

Expected: config passes; stack becomes healthy; three HTTP checks succeed. If the workstation has no Docker CLI/daemon, record this exact P0 exit-criterion blocker rather than claiming success.

- [ ] **Step 7: Commit infrastructure**

```bash
git add compose.yaml infra .env.example .dockerignore apps/*/Dockerfile.dev services/media-worker/Dockerfile.dev tests/repository-structure.node.mjs
git commit -m "chore: add P0 Docker Compose development stack"
```

---

### Task 6: Add dependency/license checks, CI, documentation, and public GitHub repository

**Files:**

- Create: `scripts/check-licenses.mjs`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/dependency-review.yml`
- Create: `.github/dependabot.yml`
- Create: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: complete P0 workspace and infrastructure.
- Produces: `npm run verify` as the root acceptance command; GitHub CI; pull-request dependency review; weekly Dependabot npm/GitHub Actions updates; public `bingoweb/LiveTV` remote.

- [ ] **Step 1: Add a failing license-check invocation**

Before `scripts/check-licenses.mjs` exists, run:

```bash
npm run licenses:check
```

Expected: FAIL because the script is missing.

- [ ] **Step 2: Implement deterministic license inspection**

Use `npm query ':root > *'` or package-lock traversal from Node to enumerate direct runtime/development dependencies and reject missing license metadata or clearly non-open-source licenses. Allow at minimum MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, BlueOak-1.0.0, CC0-1.0, and Unlicense; print every direct dependency with detected license so review remains auditable. Do not silently whitelist `UNKNOWN`.

- [ ] **Step 3: Add CI on push and pull request**

`.github/workflows/ci.yml` uses:

```yaml
uses: actions/checkout@v6
```

and:

```yaml
uses: actions/setup-node@v6
with:
  node-version: '24'
  cache: npm
```

Then run `npm ci` and `npm run verify`.

- [ ] **Step 4: Add pull-request dependency review**

Use `actions/dependency-review-action@v5` on `pull_request` with read-only contents permission. This complements the local license check by catching vulnerable or problematic newly introduced transitive dependencies.

- [ ] **Step 5: Add Dependabot configuration**

Configure weekly updates for npm at `/` and GitHub Actions at `/`, with small PR limits to avoid noisy update bursts.

- [ ] **Step 6: Write README P0 developer instructions**

README must document:

```text
Requirements: Node 22.12+ (Node 24 LTS recommended), npm, Git; Docker/Compose for container stack.
Install: npm ci
Develop: npm run dev
Verify: npm run verify
Container stack: docker compose up --build
Browser entry: http://localhost:8080
API health: /api/health
Media worker health: /media/health
```

Also state that the repository source license is intentionally undecided in P0 and that public GitHub visibility does not itself grant a software license.

- [ ] **Step 7: Run complete local verification**

```bash
npm run verify
node --test tests/repository-structure.node.mjs
git status --short
```

Expected: all checks PASS and only intentional generated/untracked files remain (ideally none).

- [ ] **Step 8: Create/push the public GitHub repository**

First verify that `bingoweb/LiveTV` does not already exist:

```bash
gh repo view bingoweb/LiveTV
```

If absent, create it from the current checkout and push `main`:

```bash
gh repo create bingoweb/LiveTV --public --source=. --remote=origin --push
```

If it already exists, inspect its default branch/contents before adding the remote; never overwrite an existing remote history blindly.

- [ ] **Step 9: Verify GitHub state**

```bash
git status --short --branch
git remote -v
gh repo view bingoweb/LiveTV --json nameWithOwner,visibility,defaultBranchRef,url
```

Expected: clean `main`, `origin` points to `bingoweb/LiveTV`, visibility is `PUBLIC`, default branch is `main`.

- [ ] **Step 10: Final P0 exit-criterion review**

Required evidence:

```text
[ ] npm ci succeeds from lockfile
[ ] npm run format:check succeeds
[ ] npm run lint succeeds
[ ] npm run typecheck succeeds
[ ] npm test succeeds
[ ] npm run build succeeds
[ ] npm run licenses:check succeeds
[ ] npm run verify succeeds
[ ] repository structure test succeeds
[ ] Docker Compose config succeeds
[ ] Docker Compose stack reaches healthy/running state
[ ] /, /api/health, /media/health succeed through Caddy
[ ] public GitHub repository exists on main
[ ] working tree is clean
```

Do not mark the Docker-specific items complete on a workstation without a Docker CLI/daemon.
