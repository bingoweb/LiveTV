import { gzipSync, gunzipSync } from 'node:zlib'

import { describe, expect, it, vi } from 'vitest'

import type { IptvList } from '../iptv/iptv-repository'
import { fetchGuideFromUrls, importGuideFile } from './epg-fetch-service'

const XML = `<tv>
  <channel id="news"><display-name>News</display-name></channel>
  <programme start="20260814120000 +0000" stop="20260814130000 +0000" channel="news"><title>News Hour</title></programme>
</tv>`

function list(overrides: Partial<IptvList> = {}): IptvList {
  return {
    id: 'list-1',
    name: 'IPTV',
    sourceType: 'url',
    sourceUrl: 'https://provider.example/list.m3u',
    epgUrls: [
      'https://provider.example/one.xml',
      'https://provider.example/two.xml',
    ],
    importedAt: 1,
    updatedAt: 1,
    channelCount: 1,
    ...overrides,
  }
}

describe('EPG browser fetch service', () => {
  it('prefers direct browser fetch and never calls API fallback on success', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(XML, {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      }),
    )
    const apiFetchImpl = vi.fn()

    const result = await fetchGuideFromUrls({
      list: list({ epgUrls: ['https://provider.example/one.xml'] }),
      fetchImpl,
      apiFetchImpl,
    })

    expect(result.mode).toBe('url')
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]?.parsed.programmes[0]?.title).toBe('News Hour')
    expect(apiFetchImpl).not.toHaveBeenCalled()
  })

  it('uses verified API fallback for a URL-backed list after direct failure', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('CORS blocked'))
    const apiFetchImpl = vi.fn().mockResolvedValue(
      new Response(XML, {
        status: 200,
        headers: { 'content-type': 'application/xml' },
      }),
    )

    const result = await fetchGuideFromUrls({
      list: list({ epgUrls: ['https://provider.example/one.xml'] }),
      fetchImpl,
      apiFetchImpl,
    })

    expect(result.sources).toHaveLength(1)
    expect(apiFetchImpl).toHaveBeenCalledWith(
      '/api/epg/fetch',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        body: JSON.stringify({
          playlistUrl: 'https://provider.example/list.m3u',
          epgUrl: 'https://provider.example/one.xml',
        }),
      }),
    )
  })

  it('treats XML without usable channels/programmes as a failed direct source and falls back', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('<tv/>', { status: 200 }))
    const apiFetchImpl = vi
      .fn()
      .mockResolvedValue(new Response(XML, { status: 200 }))

    const result = await fetchGuideFromUrls({
      list: list({ epgUrls: ['https://provider.example/one.xml'] }),
      fetchImpl,
      apiFetchImpl,
    })

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]?.parsed.programmes[0]?.title).toBe('News Hour')
    expect(apiFetchImpl).toHaveBeenCalledOnce()
  })

  it('never invokes API fallback for file/paste IPTV lists', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('CORS blocked'))
    const apiFetchImpl = vi.fn()

    await expect(
      fetchGuideFromUrls({
        list: list({
          sourceType: 'paste',
          sourceUrl: undefined,
          epgUrls: ['https://provider.example/one.xml'],
        }),
        fetchImpl,
        apiFetchImpl,
      }),
    ).rejects.toThrow()

    expect(apiFetchImpl).not.toHaveBeenCalled()
  })

  it('keeps partial source failures as warnings when another source succeeds', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('first failed'))
      .mockResolvedValueOnce(new Response(XML, { status: 200 }))
    const apiFetchImpl = vi.fn().mockRejectedValue(new Error('fallback failed'))

    const result = await fetchGuideFromUrls({
      list: list(),
      fetchImpl,
      apiFetchImpl,
    })

    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]?.sourceUrl).toBe(
      'https://provider.example/two.xml',
    )
    expect(result.warnings).toHaveLength(1)
  })

  it('rejects when every declared EPG source fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('direct failed'))
    const apiFetchImpl = vi.fn().mockRejectedValue(new Error('fallback failed'))

    await expect(
      fetchGuideFromUrls({ list: list(), fetchImpl, apiFetchImpl }),
    ).rejects.toThrow('XMLTV kaynaklarının hiçbiri alınamadı')
  })
})

describe('local XMLTV file import', () => {
  it('parses a plain XMLTV file as file-backed guide data', async () => {
    const file = new File([XML], 'guide.xml', { type: 'application/xml' })
    const result = await importGuideFile(file)

    expect(result.mode).toBe('file')
    expect(result.sources).toHaveLength(1)
    expect(result.sources[0]?.parsed.channels[0]?.id).toBe('news')
  })

  it('rejects a local XML document that contains no usable guide data', async () => {
    const file = new File(['<tv/>'], 'empty.xml', { type: 'application/xml' })

    await expect(importGuideFile(file)).rejects.toThrow(
      'kullanılabilir kanal ve program içermiyor',
    )
  })

  it('detects gzip by magic bytes regardless of filename', async () => {
    const file = new File([gzipSync(Buffer.from(XML))], 'guide.data')
    const result = await importGuideFile(file, {
      decompressionStreamFactory: () =>
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            controller.enqueue(new Uint8Array(gunzipSync(Buffer.from(chunk))))
          },
        }),
    })

    expect(result.sources[0]?.parsed.programmes[0]?.title).toBe('News Hour')
  })

  it('rejects a local XMLTV file larger than the configured ceiling', async () => {
    const file = new File([new Uint8Array(11)], 'large.xml')

    await expect(importGuideFile(file, { maxBytes: 10 })).rejects.toMatchObject(
      {
        code: 'xmltv-too-large',
      },
    )
  })
})
