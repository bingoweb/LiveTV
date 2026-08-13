import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

const requiredPaths = [
  'apps/web/package.json',
  'apps/api/package.json',
  'services/media-worker/package.json',
  'packages/shared/package.json',
  'packages/player-core/package.json',
  'apps/web/Dockerfile.dev',
  'apps/api/Dockerfile.dev',
  'services/media-worker/Dockerfile.dev',
  'compose.yaml',
  'infra/reverse-proxy/Caddyfile',
  'scripts/check-licenses.mjs',
  '.github/workflows/ci.yml',
  '.github/workflows/dependency-review.yml',
  '.github/dependabot.yml',
  'README.md',
]

test('P0 repository contains every required top-level component', () => {
  const missingPaths = requiredPaths.filter((path) => !existsSync(path))

  assert.deepEqual(missingPaths, [])
})
