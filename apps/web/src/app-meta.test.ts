import { describe, expect, it } from 'vitest'

import { appMeta } from './app-meta'

describe('appMeta', () => {
  it('identifies the LiveTV P5 Browser WebTorrent milestone', () => {
    expect(appMeta.name).toBe('LiveTV')
    expect(appMeta.phase).toBe('P5')
    expect(appMeta.tagline).toBe('Tüm yayınların tek ekranı')
  })
})
