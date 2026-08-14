import { existsSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  readWebTorrentWorkerSource,
  resolveWebTorrentWorkerPath,
  WEBTORRENT_WORKER_SCOPE,
  WEBTORRENT_WORKER_URL,
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

  it('uses a stable narrow worker URL and scope', () => {
    expect(WEBTORRENT_WORKER_URL).toBe('/webtorrent/sw.js')
    expect(WEBTORRENT_WORKER_SCOPE).toBe('/webtorrent/')
  })
})
