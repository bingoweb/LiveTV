import { existsSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  readWebTorrentWorkerSource,
  resolveWebTorrentWorkerPath,
  PWA_WORKER_SCOPE,
  PWA_WORKER_URL,
  WEBTORRENT_BRIDGE_URL,
} from '../../vite.webtorrent-worker'

describe('WebTorrent service-worker build plumbing', () => {
  it('resolves the official worker from the installed WebTorrent package', () => {
    const workerPath = resolveWebTorrentWorkerPath()

    expect(workerPath).toContain('node_modules/webtorrent/dist/sw.min.js')
    expect(existsSync(workerPath)).toBe(true)
  })

  it('reads a non-empty WebTorrent worker containing its stream bridge', () => {
    const source = readWebTorrentWorkerSource()

    expect(source.length).toBeGreaterThan(500)
    expect(source).toContain('MessageChannel')
    expect(source).toContain('type:"webtorrent"')
    expect(source).toContain('addEventListener("fetch"')
  })

  it('emits the official bridge separately while WebTorrent uses the root PWA worker', () => {
    expect(WEBTORRENT_BRIDGE_URL).toBe('/webtorrent/sw.js')
    expect(PWA_WORKER_URL).toBe('/sw.js')
    expect(PWA_WORKER_SCOPE).toBe('/')
  })
})
