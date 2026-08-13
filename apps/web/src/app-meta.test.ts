import { describe, expect, it } from 'vitest'

import { appMeta } from './app-meta'

describe('appMeta', () => {
  it('identifies the LiveTV P2 unified player shell', () => {
    expect(appMeta.name).toBe('LiveTV')
    expect(appMeta.phase).toBe('P2')
    expect(appMeta.tagline).toBe('Tüm yayınların tek ekranı')
  })
})
