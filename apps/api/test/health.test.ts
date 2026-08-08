import { afterEach, describe, expect, it } from 'vitest'

import { buildApi } from '../src/app'

const apps: ReturnType<typeof buildApi>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('GET /api/health', () => {
  it('reports the API service as healthy', async () => {
    const app = buildApi()
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      service: 'api',
      status: 'ok',
    })
  })
})
