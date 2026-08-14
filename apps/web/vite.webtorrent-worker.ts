import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import type { Plugin } from 'vite'

export const WEBTORRENT_WORKER_URL = '/webtorrent/sw.js'
export const WEBTORRENT_WORKER_SCOPE = '/webtorrent/'

const require = createRequire(import.meta.url)

export function resolveWebTorrentWorkerPath() {
  const packageJsonPath = require.resolve('webtorrent/package.json')
  return join(dirname(packageJsonPath), 'dist', 'sw.min.js')
}

export function readWebTorrentWorkerSource() {
  return readFileSync(resolveWebTorrentWorkerPath(), 'utf8')
}

export function webTorrentWorkerPlugin(): Plugin {
  return {
    name: 'livetv-webtorrent-worker',
    configureServer(server) {
      server.middlewares.use(WEBTORRENT_WORKER_URL, (_request, response) => {
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(readWebTorrentWorkerSource())
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: WEBTORRENT_WORKER_URL.slice(1),
        source: readWebTorrentWorkerSource(),
      })
    },
  }
}
