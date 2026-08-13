import { describe, expect, it } from 'vitest'

import { appMeta } from './app-meta'

describe('appMeta', () => {
  it('identifies the LiveTV P3 guest library milestone', () => {
    expect(appMeta.name).toBe('LiveTV')
    expect(appMeta.phase).toBe('P3')
    expect(appMeta.tagline).toBe('Tüm yayınların tek ekranı')
  })
})
