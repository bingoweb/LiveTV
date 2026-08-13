import { describe, expect, it, vi } from 'vitest'

import { createYouTubeDataApiClient } from '../src/youtube-data-api'

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('YouTube Data API live discovery', () => {
  it('resolves a handle to a channel ID and searches only active embeddable videos', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))

      if (url.pathname === '/youtube/v3/channels') {
        return jsonResponse({
          items: [{ id: 'UC_HALKT_TEST', snippet: { title: 'Halk TV' } }],
        })
      }

      if (url.pathname === '/youtube/v3/search') {
        return jsonResponse({ items: [] })
      }

      throw new Error(`Unexpected request: ${url.toString()}`)
    })

    const client = createYouTubeDataApiClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(
      client.resolveChannelLive('https://www.youtube.com/@Halktvkanali'),
    ).resolves.toEqual({
      status: 'offline',
      channelId: 'UC_HALKT_TEST',
    })

    const channelsUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]))
    expect(channelsUrl.origin).toBe('https://www.googleapis.com')
    expect(channelsUrl.pathname).toBe('/youtube/v3/channels')
    expect(channelsUrl.searchParams.get('part')).toBe('id,snippet')
    expect(channelsUrl.searchParams.get('forHandle')).toBe('@Halktvkanali')
    expect(channelsUrl.searchParams.get('key')).toBe('test-key')

    const searchUrl = new URL(String(fetchImpl.mock.calls[1]?.[0]))
    expect(searchUrl.pathname).toBe('/youtube/v3/search')
    expect(searchUrl.searchParams.get('part')).toBe('snippet')
    expect(searchUrl.searchParams.get('channelId')).toBe('UC_HALKT_TEST')
    expect(searchUrl.searchParams.get('type')).toBe('video')
    expect(searchUrl.searchParams.get('eventType')).toBe('live')
    expect(searchUrl.searchParams.get('videoEmbeddable')).toBe('true')
    expect(searchUrl.searchParams.get('maxResults')).toBe('10')
    expect(searchUrl.searchParams.get('key')).toBe('test-key')
  })

  it('verifies and enriches the active live video with videos.list', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))

      if (url.pathname === '/youtube/v3/channels') {
        return jsonResponse({ items: [{ id: 'UC_HALKT_TEST' }] })
      }

      if (url.pathname === '/youtube/v3/search') {
        return jsonResponse({
          items: [
            {
              id: { videoId: '1uvsDurqSpM' },
              snippet: { title: 'Search title' },
            },
          ],
        })
      }

      if (url.pathname === '/youtube/v3/videos') {
        return jsonResponse({
          items: [
            {
              id: '1uvsDurqSpM',
              snippet: {
                title: '#CANLI | Günaydın Türkiye',
                thumbnails: {
                  high: {
                    url: 'https://i.ytimg.com/vi/1uvsDurqSpM/hqdefault.jpg',
                  },
                },
              },
              status: { embeddable: true },
              liveStreamingDetails: {
                actualStartTime: '2026-08-13T04:30:00Z',
                concurrentViewers: '1234',
              },
            },
          ],
        })
      }

      throw new Error(`Unexpected request: ${url.toString()}`)
    })

    const client = createYouTubeDataApiClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(
      client.resolveChannelLive('https://www.youtube.com/@Halktvkanali'),
    ).resolves.toEqual({
      status: 'live',
      channelId: 'UC_HALKT_TEST',
      videoId: '1uvsDurqSpM',
      videoUrl: 'https://www.youtube.com/watch?v=1uvsDurqSpM',
      title: '#CANLI | Günaydın Türkiye',
      thumbnailUrl: 'https://i.ytimg.com/vi/1uvsDurqSpM/hqdefault.jpg',
      actualStartTime: '2026-08-13T04:30:00Z',
      concurrentViewers: '1234',
    })

    const videosUrl = new URL(String(fetchImpl.mock.calls[2]?.[0]))
    expect(videosUrl.pathname).toBe('/youtube/v3/videos')
    expect(videosUrl.searchParams.get('part')).toBe(
      'snippet,liveStreamingDetails,status',
    )
    expect(videosUrl.searchParams.get('id')).toBe('1uvsDurqSpM')
    expect(videosUrl.searchParams.get('key')).toBe('test-key')
  })

  it('reuses channel/live caches but bypasses only the live cache on manual refresh', async () => {
    let channelsCalls = 0
    let searchCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))

      if (url.pathname === '/youtube/v3/channels') {
        channelsCalls += 1
        return jsonResponse({ items: [{ id: 'UC_HALKT_TEST' }] })
      }

      if (url.pathname === '/youtube/v3/search') {
        searchCalls += 1
        return jsonResponse({ items: [] })
      }

      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    let clock = Date.parse('2026-08-13T05:00:00Z')
    const client = createYouTubeDataApiClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
      now: () => clock,
    })

    await client.resolveChannelLive('https://www.youtube.com/@Halktvkanali')
    clock += 5_000
    await client.resolveChannelLive('https://www.youtube.com/@Halktvkanali')

    expect(channelsCalls).toBe(1)
    expect(searchCalls).toBe(1)

    await client.resolveChannelLive('https://www.youtube.com/@Halktvkanali', {
      refresh: true,
    })

    expect(channelsCalls).toBe(1)
    expect(searchCalls).toBe(2)
  })

  it('accepts a bare @handle without requiring a full YouTube URL', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/youtube/v3/channels') {
        expect(url.searchParams.get('forHandle')).toBe('@Halktvkanali')
        return jsonResponse({ items: [{ id: 'UC_HALKT_TEST' }] })
      }
      if (url.pathname === '/youtube/v3/search') {
        return jsonResponse({ items: [] })
      }
      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    const client = createYouTubeDataApiClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(client.resolveChannelLive('@Halktvkanali')).resolves.toEqual({
      status: 'offline',
      channelId: 'UC_HALKT_TEST',
    })
  })

  it('uses a direct /channel/ ID without spending a channels.list lookup', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/youtube/v3/channels') {
        throw new Error('channels.list must not run for a direct channel ID')
      }
      if (url.pathname === '/youtube/v3/search') {
        expect(url.searchParams.get('channelId')).toBe('UC_DIRECT_TEST')
        return jsonResponse({ items: [] })
      }
      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    const client = createYouTubeDataApiClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(
      client.resolveChannelLive(
        'https://www.youtube.com/channel/UC_DIRECT_TEST',
      ),
    ).resolves.toEqual({
      status: 'offline',
      channelId: 'UC_DIRECT_TEST',
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('caches a stale search result as offline when videos.list no longer returns the live video', async () => {
    let searchCalls = 0
    let videosCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/youtube/v3/channels') {
        return jsonResponse({ items: [{ id: 'UC_HALKT_TEST' }] })
      }
      if (url.pathname === '/youtube/v3/search') {
        searchCalls += 1
        return jsonResponse({
          items: [{ id: { videoId: '1uvsDurqSpM' } }],
        })
      }
      if (url.pathname === '/youtube/v3/videos') {
        videosCalls += 1
        return jsonResponse({ items: [] })
      }
      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    let clock = Date.parse('2026-08-13T05:00:00Z')
    const client = createYouTubeDataApiClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
      now: () => clock,
    })

    await expect(client.resolveChannelLive('@Halktvkanali')).resolves.toEqual({
      status: 'offline',
      channelId: 'UC_HALKT_TEST',
    })
    clock += 5_000
    await expect(client.resolveChannelLive('@Halktvkanali')).resolves.toEqual({
      status: 'offline',
      channelId: 'UC_HALKT_TEST',
    })

    expect(searchCalls).toBe(1)
    expect(videosCalls).toBe(1)
  })

  it('treats a broadcast that ended between search.list and videos.list as offline', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/youtube/v3/channels') {
        return jsonResponse({ items: [{ id: 'UC_HALKT_TEST' }] })
      }
      if (url.pathname === '/youtube/v3/search') {
        return jsonResponse({
          items: [{ id: { videoId: '1uvsDurqSpM' } }],
        })
      }
      if (url.pathname === '/youtube/v3/videos') {
        return jsonResponse({
          items: [
            {
              id: '1uvsDurqSpM',
              snippet: { title: 'Az önce sona erdi' },
              status: { embeddable: true },
              liveStreamingDetails: {
                actualStartTime: '2026-08-13T04:30:00Z',
                actualEndTime: '2026-08-13T05:00:00Z',
              },
            },
          ],
        })
      }
      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    const client = createYouTubeDataApiClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(client.resolveChannelLive('@Halktvkanali')).resolves.toEqual({
      status: 'offline',
      channelId: 'UC_HALKT_TEST',
    })
  })

  it('includes the YouTube Data API error message in failed requests', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            message:
              'The request cannot be completed because quota has been exceeded.',
          },
        },
        403,
      ),
    )
    const client = createYouTubeDataApiClient({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(client.resolveChannelLive('@Halktvkanali')).rejects.toThrow(
      'YouTube Data API isteği başarısız (403): The request cannot be completed because quota has been exceeded.',
    )
  })
})
