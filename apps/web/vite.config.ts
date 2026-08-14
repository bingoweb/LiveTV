import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { webTorrentWorkerPlugin } from './vite.webtorrent-worker.ts'

export default defineConfig({
  plugins: [react(), webTorrentWorkerPlugin()],
})
