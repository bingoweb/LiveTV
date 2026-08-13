import { describe, expect, it, vi } from 'vitest'

import {
  featuredYouTubeChannels,
  loadFeaturedLiveStatuses,
} from './live-channels'

describe('loadFeaturedLiveStatuses', () => {
  it('loads live/offline state for every configured channel independently', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('Halktvkanali')) {
        return new Response(
          JSON.stringify({
            status: 'live',
            videoId: '1uvsDurqSpM',
            videoUrl: 'https://www.youtube.com/watch?v=1uvsDurqSpM',
            title: '#CANLI | Günaydın Türkiye',
            thumbnailUrl:
              'https://i.ytimg.com/vi/1uvsDurqSpM/maxresdefault.jpg',
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      return new Response(JSON.stringify({ status: 'offline' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const statuses = await loadFeaturedLiveStatuses(fetchImpl)

    expect(statuses).toEqual([
      expect.objectContaining({
        channel: featuredYouTubeChannels[0],
        status: 'live',
        videoId: '1uvsDurqSpM',
        title: '#CANLI | Günaydın Türkiye',
      }),
      expect.objectContaining({
        channel: featuredYouTubeChannels[1],
        status: 'offline',
      }),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('keeps one channel failure from hiding the other channels', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('bad gateway', { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: 'offline' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )

    const statuses = await loadFeaturedLiveStatuses(fetchImpl)

    expect(statuses[0]).toMatchObject({ status: 'error' })
    expect(statuses[1]).toMatchObject({ status: 'offline' })
  })
})
