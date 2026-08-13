import { describe, expect, it } from 'vitest'

import { appMeta } from './app-meta'

describe('appMeta', () => {
  it('identifies the LiveTV P1 application shell', () => {
    expect(appMeta.name).toBe('LiveTV')
    expect(appMeta.phase).toBe('P1')
    expect(appMeta.tagline).toBe('Tüm yayınların tek ekranı')
  })
})
