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
    const app = buildApi({ fetchImpl })
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
})
