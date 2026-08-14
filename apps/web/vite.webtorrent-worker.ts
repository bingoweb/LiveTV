import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import type { Plugin } from 'vite'

import {
  PWA_WORKER_SCOPE,
  PWA_WORKER_URL,
  WEBTORRENT_BRIDGE_URL,
} from './src/torrent/webtorrent-worker-config.js'

export { PWA_WORKER_SCOPE, PWA_WORKER_URL, WEBTORRENT_BRIDGE_URL }

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
      server.middlewares.use(WEBTORRENT_BRIDGE_URL, (_request, response) => {
        response.statusCode = 200
        response.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-cache')
        response.end(readWebTorrentWorkerSource())
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: WEBTORRENT_BRIDGE_URL.slice(1),
        source: readWebTorrentWorkerSource(),
      })
    },
  }
}
