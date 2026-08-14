import { describe, expect, it, vi } from 'vitest'

import {
  importIptvFromFile,
  importIptvFromText,
  importIptvFromUrl,
  IPTV_MAX_IMPORT_BYTES,
} from './iptv-import-service'

const validPlaylist = `#EXTM3U
#EXTINF:-1 group-title="Haber",Haber
https://example.com/live.m3u8`

describe('IPTV import service', () => {
  it('imports an HTTP playlist and resolves relative channel URLs against it', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(`#EXTM3U
#EXTINF:-1,Relative
../streams/live.m3u8`, { status: 200 }),
    )

    const result = await importIptvFromUrl(
      'https://lists.example/main/channels.m3u',
      { fetchImpl },
    )

    expect(result.suggestedName).toBe('channels')
    expect(result.playlist.channels[0]?.streamUrl).toBe(
      'https://lists.example/streams/live.m3u8',
    )
  })

  it('rejects non-HTTP URLs before fetching', async () => {
    const fetchImpl = vi.fn()

    await expect(
      importIptvFromUrl('ftp://lists.example/channels.m3u', { fetchImpl }),
    ).rejects.toThrow('HTTP veya HTTPS')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('maps non-2xx responses to a useful import error', async () => {
    const fetchImpl = vi.fn(async () => new Response('no', { status: 403 }))

    await expect(
      importIptvFromUrl('https://lists.example/channels.m3u', { fetchImpl }),
    ).rejects.toThrow('HTTP 403')
  })

  it('aborts a URL import after the bounded timeout', async () => {
    const fetchImpl = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) =>
        await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
    )

    await expect(
      importIptvFromUrl('https://lists.example/slow.m3u', {
        fetchImpl,
        timeoutMs: 5,
      }),
    ).rejects.toThrow('zaman aşımına')
  })

  it('rejects an oversized response from Content-Length before reading it', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(validPlaylist, {
        headers: {
          'content-length': String(IPTV_MAX_IMPORT_BYTES + 1),
        },
      }),
    )

    await expect(
      importIptvFromUrl('https://lists.example/large.m3u', { fetchImpl }),
    ).rejects.toThrow('10 MiB')
  })

  it('rejects an oversized body even when Content-Length is absent', async () => {
    const oversized = 'x'.repeat(IPTV_MAX_IMPORT_BYTES + 1)
    const fetchImpl = vi.fn(async () => new Response(oversized))

    await expect(
      importIptvFromUrl('https://lists.example/large.m3u', { fetchImpl }),
    ).rejects.toThrow('10 MiB')
  })

  it('uses the file name and rejects files above the size limit', async () => {
    const valid = new File([validPlaylist], 'haber-listem.m3u')
    const result = await importIptvFromFile(valid)
    expect(result.suggestedName).toBe('haber-listem')
    expect(result.playlist.channels).toHaveLength(1)

    const large = new File(
      [new Uint8Array(IPTV_MAX_IMPORT_BYTES + 1)],
      'large.m3u',
    )
    await expect(importIptvFromFile(large)).rejects.toThrow('10 MiB')
  })

  it('keeps non-fatal parser warnings when at least one valid channel exists', () => {
    const result = importIptvFromText(`#EXTM3U
#EXTINF:-1,Bad
rtsp://example.com/live
#EXTINF:-1,Good
https://example.com/good.m3u8`)

    expect(result.suggestedName).toBe('IPTV Listesi')
    expect(result.playlist.channels).toHaveLength(1)
    expect(result.playlist.warnings).toHaveLength(1)
  })

  it('rejects imports with zero valid channels', () => {
    expect(() =>
      importIptvFromText(`#EXTM3U
#EXTINF:-1,Only bad
rtsp://example.com/live`),
    ).toThrow('geçerli kanal')
  })
})
