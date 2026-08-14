import { describe, expect, it } from 'vitest'

import { parseM3u } from './m3u-parser'

describe('parseM3u', () => {
  it('parses extended M3U metadata, EPG URLs, and comma-containing titles', () => {
    const result = parseM3u(`#EXTM3U url-tvg="https://epg.example/a.xml, https://epg.example/b.xml" x-tvg-url=https://epg.example/c.xml
#EXTINF:-1 tvg-id="news.tr" tvg-name="Haber 1" tvg-logo="https://img.example/logo.png" group-title="Haber",Haber, Canlı
https://cdn.example/live/index.m3u8?token=abc#edge`)

    expect(result.epgUrls).toEqual([
      'https://epg.example/a.xml',
      'https://epg.example/b.xml',
      'https://epg.example/c.xml',
    ])
    expect(result.channels).toEqual([
      {
        name: 'Haber 1',
        streamUrl: 'https://cdn.example/live/index.m3u8?token=abc#edge',
        tvgId: 'news.tr',
        tvgName: 'Haber 1',
        logoUrl: 'https://img.example/logo.png',
        groupTitle: 'Haber',
      },
    ])
    expect(result.warnings).toEqual([])
  })

  it('uses EXTGRP only when group-title is absent and falls back to the EXTINF display name', () => {
    const result = parseM3u(`#EXTM3U
#EXTINF:-1,Discovery World
#EXTGRP:Belgesel
https://media.example/discovery.m3u8
#EXTINF:-1 group-title="Spor",Arena
#EXTGRP:Ignored
https://media.example/arena.m3u8`)

    expect(result.channels).toMatchObject([
      { name: 'Discovery World', groupTitle: 'Belgesel' },
      { name: 'Arena', groupTitle: 'Spor' },
    ])
  })

  it('resolves relative stream URLs only when a base URL is supplied', () => {
    const text = `#EXTM3U
#EXTINF:-1,Relative
../streams/live.m3u8?sig=123#frag`

    expect(
      parseM3u(text, { baseUrl: 'https://lists.example/main/list.m3u' })
        .channels[0]?.streamUrl,
    ).toBe('https://lists.example/streams/live.m3u8?sig=123#frag')

    const withoutBase = parseM3u(text)
    expect(withoutBase.channels).toEqual([])
    expect(withoutBase.warnings).toEqual([
      expect.objectContaining({ code: 'relative-url-without-base' }),
    ])
  })

  it('skips unsupported or malformed channel URLs without failing valid entries', () => {
    const result = parseM3u(`#EXTM3U
#EXTINF:-1,Bad scheme
rtsp://example.com/live
#EXTINF:-1,Malformed
https://exa mple.com/live
#EXTINF:-1,Missing URL
#EXTINF:-1,Good
https://example.com/good.m3u8`)

    expect(result.channels).toHaveLength(1)
    expect(result.channels[0]?.name).toBe('Good')
    expect(result.warnings.map(({ code }) => code)).toEqual([
      'unsupported-protocol',
      'invalid-url',
      'missing-stream-url',
    ])
  })

  it('deduplicates identical channel identities while preserving the first position', () => {
    const result = parseM3u(`#EXTM3U
#EXTINF:-1 tvg-id="same",First name
https://example.com/live.m3u8?token=1
#EXTINF:-1 tvg-id="same",Second name
https://example.com/live.m3u8?token=1
#EXTINF:-1 tvg-id="different",Third
https://example.com/live.m3u8?token=1`)

    expect(result.channels.map(({ name, tvgId }) => ({ name, tvgId }))).toEqual([
      { name: 'First name', tvgId: 'same' },
      { name: 'Third', tvgId: 'different' },
    ])
  })

  it('uses a deterministic host/path fallback when no usable channel name exists', () => {
    const result = parseM3u(`#EXTM3U
#EXTINF:-1,
https://example.com/live/channel-7.m3u8`)

    expect(result.channels[0]?.name).toBe('example.com/live/channel-7.m3u8')
  })
})
