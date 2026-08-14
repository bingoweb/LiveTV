import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApi } from '../src/app'
import { EpgFallbackError, fetchVerifiedEpg } from '../src/epg-fallback'

const apps: ReturnType<typeof buildApi>[] = []

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('verified EPG fallback', () => {
  it('verifies the requested EPG URL against the independently fetched playlist header', async () => {
    const fetchText = vi
      .fn()
      .mockResolvedValueOnce({
        finalUrl: 'https://provider.example/lists/main.m3u',
        text: '#EXTM3U url-tvg="guide.xml"\n#EXTINF:-1,News',
      })
      .mockResolvedValueOnce({
        finalUrl: 'https://provider.example/lists/guide.xml',
        text: '<tv/>',
        contentType: 'application/xml',
      })

    const result = await fetchVerifiedEpg(
      {
        playlistUrl: 'https://provider.example/lists/main.m3u',
        epgUrl: 'https://provider.example/lists/guide.xml',
      },
      { fetchText },
    )

    expect(result).toEqual({
      xml: '<tv/>',
      epgUrl: 'https://provider.example/lists/guide.xml',
    })
    expect(fetchText).toHaveBeenNthCalledWith(
      1,
      'https://provider.example/lists/main.m3u',
      expect.objectContaining({
        maxBytes: 10 * 1024 * 1024,
        timeoutMs: 12_000,
      }),
    )
    expect(fetchText).toHaveBeenNthCalledWith(
      2,
      'https://provider.example/lists/guide.xml',
      expect.objectContaining({
        maxBytes: 50 * 1024 * 1024,
        timeoutMs: 20_000,
      }),
    )
  })

  it('never fetches an undeclared EPG URL', async () => {
    const fetchText = vi.fn().mockResolvedValueOnce({
      finalUrl: 'https://provider.example/list.m3u',
      text: '#EXTM3U url-tvg="https://provider.example/declared.xml"',
    })

    await expect(
      fetchVerifiedEpg(
        {
          playlistUrl: 'https://provider.example/list.m3u',
          epgUrl: 'https://attacker.example/private.xml',
        },
        { fetchText },
      ),
    ).rejects.toMatchObject({
      code: 'epg_not_declared_by_playlist',
      statusCode: 400,
    })
    expect(fetchText).toHaveBeenCalledTimes(1)
  })

  it('maps playlist and EPG fetch failures to typed errors', async () => {
    const playlistFetch = vi.fn().mockRejectedValue(new Error('network'))
    await expect(
      fetchVerifiedEpg(
        {
          playlistUrl: 'https://provider.example/list.m3u',
          epgUrl: 'https://provider.example/guide.xml',
        },
        { fetchText: playlistFetch },
      ),
    ).rejects.toMatchObject({ code: 'playlist_fetch_failed', statusCode: 502 })

    const epgFetch = vi
      .fn()
      .mockResolvedValueOnce({
        finalUrl: 'https://provider.example/list.m3u',
        text: '#EXTM3U url-tvg="https://provider.example/guide.xml"',
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('too large'), { code: 'response-too-large' }),
      )
    await expect(
      fetchVerifiedEpg(
        {
          playlistUrl: 'https://provider.example/list.m3u',
          epgUrl: 'https://provider.example/guide.xml',
        },
        { fetchText: epgFetch },
      ),
    ).rejects.toMatchObject({
      code: 'epg_response_too_large',
      statusCode: 502,
    })
  })
})

describe('EPG API route', () => {
  it('returns XML from the injected verified fetcher', async () => {
    const epgFetcher = vi.fn().mockResolvedValue({
      xml: '<tv><channel id="a"/></tv>',
      epgUrl: 'https://provider.example/guide.xml',
    })
    const app = buildApi({ epgFetcher })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/epg/fetch',
      payload: {
        playlistUrl: 'https://provider.example/list.m3u',
        epgUrl: 'https://provider.example/guide.xml',
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('application/xml')
    expect(response.body).toContain('<channel id="a"/>')
  })

  it('returns structured typed EPG errors without message matching', async () => {
    const epgFetcher = vi
      .fn()
      .mockRejectedValue(
        new EpgFallbackError(
          'epg_not_declared_by_playlist',
          400,
          'EPG playlistte ilan edilmiyor.',
        ),
      )
    const app = buildApi({ epgFetcher })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/epg/fetch',
      payload: {
        playlistUrl: 'https://provider.example/list.m3u',
        epgUrl: 'https://provider.example/guide.xml',
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: 'epg_not_declared_by_playlist',
      message: 'EPG playlistte ilan edilmiyor.',
    })
  })

  it('rejects missing request fields before invoking the fetcher', async () => {
    const epgFetcher = vi.fn()
    const app = buildApi({ epgFetcher })
    apps.push(app)

    const response = await app.inject({
      method: 'POST',
      url: '/api/epg/fetch',
      payload: { epgUrl: 'https://provider.example/guide.xml' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'invalid_epg_request' })
    expect(epgFetcher).not.toHaveBeenCalled()
  })
})
