import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { test } from 'node:test'

const requiredPaths = [
  'apps/web/package.json',
  'apps/api/package.json',
  'services/media-worker/package.json',
  'packages/shared/package.json',
  'packages/player-core/package.json',
  'compose.yaml',
  'infra/reverse-proxy/Caddyfile',
]

test('P0 repository contains every required top-level component', () => {
  const missingPaths = requiredPaths.filter((path) => !existsSync(path))

  assert.deepEqual(missingPaths, [])
})
