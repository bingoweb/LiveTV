import { afterEach, describe, expect, it } from 'vitest'

import { buildMediaWorker } from '../src/app'

const apps: ReturnType<typeof buildMediaWorker>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('GET /media/health', () => {
  it('reports the media worker as healthy', async () => {
    const app = buildMediaWorker()
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/media/health',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      service: 'media-worker',
      status: 'ok',
    })
  })
})
