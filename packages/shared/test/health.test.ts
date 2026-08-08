import { describe, expect, it } from 'vitest'

import { createServiceHealth } from '../src/health'

describe('createServiceHealth', () => {
  it('creates an ok health payload for a service', () => {
    expect(createServiceHealth('api')).toEqual({
      service: 'api',
      status: 'ok',
    })
  })
})
