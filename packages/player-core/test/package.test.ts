import { describe, expect, it } from 'vitest'

import { PLAYER_CORE_PHASE } from '../src/index'

describe('player-core package boundary', () => {
  it('identifies the unified player phase', () => {
    expect(PLAYER_CORE_PHASE).toBe('P2')
  })
})
