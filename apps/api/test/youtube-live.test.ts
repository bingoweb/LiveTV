import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApi } from '../src/app'
import {
  extractYouTubeLivePage,
  normalizeYouTubeChannelLiveUrl,
} from '../src/youtube-live'

const apps: ReturnType<typeof buildApi>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('YouTube live channel resolver', () => {
  it('normalizes handle and channel URLs to the live endpoint', () => {
    expect(
      normalizeYouTubeChannelLiveUrl('https://www.youtube.com/@Halktvkanali'),
    ).toBe('https://www.youtube.com/@Halktvkanali/live')

    expect(
      normalizeYouTubeChannelLiveUrl(
        'https://www.youtube.com/channel/UCf_ResXZzE-o18zACUEmyvQ/live',
      ),
    ).toBe('https://www.youtube.com/channel/UCf_ResXZzE-o18zACUEmyvQ/live')
  })

  it('extracts an active live video from the canonical page URL', () => {
    expect(
      extractYouTubeLivePage(`
        <link rel="canonical" href="https://www.youtube.com/watch?v=1uvsDurqSpM">
        <meta property="og:title" content="#CANLI | Günaydın Türkiye">
        <meta property="og:image" content="https://i.ytimg.com/vi/1uvsDurqSpM/maxresdefault.jpg">
        <script>var x={"channelId":"UCf_ResXZzE-o18zACUEmyvQ"}</script>
      `),
    ).toEqual({
      status: 'live',
      videoId: '1uvsDurqSpM',
      channelId: 'UCf_ResXZzE-o18zACUEmyvQ',
      title: '#CANLI | Günaydın Türkiye',
      thumbnailUrl: 'https://i.ytimg.com/vi/1uvsDurqSpM/maxresdefault.jpg',
    })
  })

  it('returns offline when /live resolves back to a channel page', () => {
    expect(
      extractYouTubeLivePage(`
        <link rel="canonical" href="https://www.youtube.com/channel/UCO9AQtN33IP53uiImJ_59OQ">
        <script>var x={"externalId":"UCO9AQtN33IP53uiImJ_59OQ"}</script>
      `),
    ).toEqual({
      status: 'offline',
      channelId: 'UCO9AQtN33IP53uiImJ_59OQ',
    })
  })

  it('uses live videoDetails as a fallback when canonical metadata is missing', () => {
    expect(
      extractYouTubeLivePage(`
        <script>
          var player={"videoDetails":{"videoId":"1uvsDurqSpM","title":"Canlı yayın","isLiveContent":true},"channelId":"UCf_ResXZzE-o18zACUEmyvQ"};
        </script>
      `),
    ).toMatchObject({
      status: 'live',
      videoId: '1uvsDurqSpM',
      channelId: 'UCf_ResXZzE-o18zACUEmyvQ',
    })
  })

  it('does not misreport an unrelated/blocked page as offline', () => {
    expect(() =>
      extractYouTubeLivePage('<html><title>Consent required</title></html>'),
    ).toThrow('YouTube canlı sayfası beklenen kanal verisini içermiyor.')
  })

  it('exposes the resolver through the API without a YouTube API key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        '<link rel="canonical" href="https://www.youtube.com/watch?v=1uvsDurqSpM">',
        {
          status: 200,
          headers: { 'content-type': 'text/html' },
        },
      ),
    )
    const app = buildApi({ fetchImpl, youtubeApiKey: '' })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/youtube/resolve-live?url=https%3A%2F%2Fwww.youtube.com%2F%40Halktvkanali',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'live',
      videoId: '1uvsDurqSpM',
      videoUrl: 'https://www.youtube.com/watch?v=1uvsDurqSpM',
      liveUrl: 'https://www.youtube.com/@Halktvkanali/live',
      discoveryMethod: 'live-page',
      officialApiAvailable: false,
    })
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://www.youtube.com/@Halktvkanali/live',
      expect.objectContaining({ redirect: 'follow' }),
    )
  })

  it('retries one transient YouTube fetch failure before returning live data', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('temporary network failure'))
      .mockResolvedValueOnce(
        new Response(
          '<link rel="canonical" href="https://www.youtube.com/watch?v=1uvsDurqSpM">',
          { status: 200 },
        ),
      )
    const app = buildApi({ fetchImpl })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/youtube/resolve-live?url=https%3A%2F%2Fwww.youtube.com%2F%40Halktvkanali',
    })

    expect(response.statusCode).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(response.json()).toMatchObject({
      status: 'live',
      videoId: '1uvsDurqSpM',
    })
  })

  it('prefers the official YouTube Data API when an API key is configured', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))

      if (url.hostname === 'www.youtube.com') {
        throw new Error('The HTML live-page fallback must not run.')
      }

      if (url.pathname === '/youtube/v3/channels') {
        return new Response(
          JSON.stringify({ items: [{ id: 'UC_HALKT_TEST' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      if (url.pathname === '/youtube/v3/search') {
        return new Response(
          JSON.stringify({
            items: [{ id: { videoId: '1uvsDurqSpM' } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      if (url.pathname === '/youtube/v3/videos') {
        return new Response(
          JSON.stringify({
            items: [
              {
                id: '1uvsDurqSpM',
                snippet: { title: '#CANLI | Halk TV' },
                status: { embeddable: true },
                liveStreamingDetails: {
                  actualStartTime: '2026-08-13T04:30:00Z',
                },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    const app = buildApi({
      fetchImpl: fetchImpl as typeof fetch,
      youtubeApiKey: 'test-key',
    })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/youtube/resolve-live?url=https%3A%2F%2Fwww.youtube.com%2F%40Halktvkanali',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'live',
      channelId: 'UC_HALKT_TEST',
      videoId: '1uvsDurqSpM',
      videoUrl: 'https://www.youtube.com/watch?v=1uvsDurqSpM',
      title: '#CANLI | Halk TV',
      discoveryMethod: 'data-api',
      officialApiAvailable: true,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('falls back to the channel live page when the official API fails', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))

      if (url.pathname === '/youtube/v3/channels') {
        return new Response(
          JSON.stringify({
            error: { message: 'Search quota temporarily unavailable.' },
          }),
          { status: 429, headers: { 'content-type': 'application/json' } },
        )
      }

      if (url.hostname === 'www.youtube.com') {
        return new Response(
          '<link rel="canonical" href="https://www.youtube.com/watch?v=1uvsDurqSpM">',
          { status: 200, headers: { 'content-type': 'text/html' } },
        )
      }

      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    const app = buildApi({
      fetchImpl: fetchImpl as typeof fetch,
      youtubeApiKey: 'test-key',
    })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/youtube/resolve-live?url=https%3A%2F%2Fwww.youtube.com%2F%40Halktvkanali',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'live',
      videoId: '1uvsDurqSpM',
      discoveryMethod: 'live-page-fallback',
      officialApiAvailable: true,
      warning:
        'YouTube Data API isteği başarısız (429): Search quota temporarily unavailable.',
    })
  })

  it('bypasses the short live cache when refresh=1 is requested', async () => {
    let channelsCalls = 0
    let searchCalls = 0
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))

      if (url.pathname === '/youtube/v3/channels') {
        channelsCalls += 1
        return new Response(
          JSON.stringify({ items: [{ id: 'UC_HALKT_TEST' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }

      if (url.pathname === '/youtube/v3/search') {
        searchCalls += 1
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }

      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    const app = buildApi({
      fetchImpl: fetchImpl as typeof fetch,
      youtubeApiKey: 'test-key',
      now: () => Date.parse('2026-08-13T05:00:00Z'),
    })
    apps.push(app)
    const baseUrl =
      '/api/youtube/resolve-live?url=https%3A%2F%2Fwww.youtube.com%2F%40Halktvkanali'

    expect((await app.inject({ method: 'GET', url: baseUrl })).statusCode).toBe(
      200,
    )
    expect((await app.inject({ method: 'GET', url: baseUrl })).statusCode).toBe(
      200,
    )
    expect(channelsCalls).toBe(1)
    expect(searchCalls).toBe(1)

    expect(
      (await app.inject({ method: 'GET', url: `${baseUrl}&refresh=1` }))
        .statusCode,
    ).toBe(200)
    expect(channelsCalls).toBe(1)
    expect(searchCalls).toBe(2)
  })

  it('keeps an official API offline result authoritative without HTML fallback', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.hostname === 'www.youtube.com') {
        throw new Error('Offline Data API results must not trigger fallback.')
      }
      if (url.pathname === '/youtube/v3/channels') {
        return new Response(
          JSON.stringify({ items: [{ id: 'UC_HALKT_TEST' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.pathname === '/youtube/v3/search') {
        return new Response(JSON.stringify({ items: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    const app = buildApi({
      fetchImpl: fetchImpl as typeof fetch,
      youtubeApiKey: 'test-key',
    })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/youtube/resolve-live?url=https%3A%2F%2Fwww.youtube.com%2F%40Halktvkanali',
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      status: 'offline',
      channelId: 'UC_HALKT_TEST',
      discoveryMethod: 'data-api',
      officialApiAvailable: true,
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('returns 502 when both official discovery and the live-page fallback fail', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname === '/youtube/v3/channels') {
        return new Response(
          JSON.stringify({ error: { message: 'Temporary upstream error.' } }),
          { status: 503, headers: { 'content-type': 'application/json' } },
        )
      }
      if (url.hostname === 'www.youtube.com') {
        return new Response('upstream unavailable', { status: 503 })
      }
      throw new Error(`Unexpected request: ${url.toString()}`)
    })
    const app = buildApi({
      fetchImpl: fetchImpl as typeof fetch,
      youtubeApiKey: 'test-key',
    })
    apps.push(app)

    const response = await app.inject({
      method: 'GET',
      url: '/api/youtube/resolve-live?url=https%3A%2F%2Fwww.youtube.com%2F%40Halktvkanali',
    })

    expect(response.statusCode).toBe(502)
    expect(response.json()).toMatchObject({
      error: 'youtube_live_resolution_failed',
      message: 'YouTube canlı sayfası alınamadı (503).',
    })
  })
})
