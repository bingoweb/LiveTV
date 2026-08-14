import { describe, expect, it } from 'vitest'

import { appMeta } from './app-meta'

describe('appMeta', () => {
  it('identifies the LiveTV P6 XMLTV TV Guide milestone', () => {
    expect(appMeta.name).toBe('LiveTV')
    expect(appMeta.phase).toBe('P6')
    expect(appMeta.tagline).toBe('Tüm yayınların tek ekranı')
  })
})
