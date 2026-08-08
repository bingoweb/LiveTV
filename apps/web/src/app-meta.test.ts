import { describe, expect, it } from 'vitest'

import { appMeta } from './app-meta'

describe('appMeta', () => {
  it('identifies the LiveTV P0 foundation', () => {
    expect(appMeta).toEqual({
      name: 'LiveTV',
      phase: 'P0',
    })
  })
})
