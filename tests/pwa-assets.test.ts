import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'))

describe('LiveTV PWA assets', () => {
  it('declares an installable standalone manifest with required icon sizes', () => {
    const manifest = readJson('apps/web/public/manifest.webmanifest')

    expect(manifest).toMatchObject({
      id: '/',
      name: 'LiveTV',
      short_name: 'LiveTV',
      lang: 'tr',
      start_url: '/',
      scope: '/',
      display: 'standalone',
    })

    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
        expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
      ]),
    )
  })

  it('keeps API and media traffic outside the service-worker cache path', () => {
    const serviceWorker = readFileSync('apps/web/public/sw.js', 'utf8')

    expect(serviceWorker).toContain("self.importScripts('/webtorrent/sw.js')")
    expect(serviceWorker).toContain("url.pathname.startsWith('/api/')")
    expect(serviceWorker).toContain("url.pathname.startsWith('/media/')")
    expect(serviceWorker).toContain("url.pathname.startsWith('/webtorrent/')")
    expect(serviceWorker).toContain("request.destination === 'video'")
    expect(serviceWorker).toContain("request.destination === 'audio'")
    expect(serviceWorker).toContain('event.respondWith')
  })
})
