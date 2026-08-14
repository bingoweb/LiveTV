import { describe, expect, it } from 'vitest'

import { appMeta } from './app-meta'

describe('appMeta', () => {
  it('identifies the LiveTV P4 IPTV library milestone', () => {
    expect(appMeta.name).toBe('LiveTV')
    expect(appMeta.phase).toBe('P4')
    expect(appMeta.tagline).toBe('Tüm yayınların tek ekranı')
  })
})
