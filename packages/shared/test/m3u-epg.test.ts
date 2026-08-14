import { describe, expect, it } from 'vitest'

import { extractM3uEpgUrls } from '../src/m3u-epg'

describe('extractM3uEpgUrls', () => {
  it('extracts declared EPG URLs in attribute order and removes duplicates', () => {
    const text =
      '#EXTM3U url-tvg="https://epg.example/a.xml, https://epg.example/b.xml" x-tvg-url="https://epg.example/b.xml" tvg-url="https://epg.example/c.xml"\n#EXTINF:-1,Channel'

    expect(extractM3uEpgUrls(text)).toEqual([
      'https://epg.example/a.xml',
      'https://epg.example/b.xml',
      'https://epg.example/c.xml',
    ])
  })

  it('resolves relative URLs against the playlist URL', () => {
    expect(
      extractM3uEpgUrls(
        '#EXTM3U url-tvg="guide.xml"',
        'https://iptv.example/lists/main.m3u',
      ),
    ).toEqual(['https://iptv.example/lists/guide.xml'])
  })

  it('ignores malformed, unsupported, and relative values without a base URL', () => {
    expect(
      extractM3uEpgUrls(
        '#EXTM3U url-tvg="guide.xml, ftp://epg.example/a.xml, not a url" x-tvg-url="https://epg.example/ok.xml"',
      ),
    ).toEqual(['https://epg.example/ok.xml'])
  })

  it('reads only the first EXTM3U header line', () => {
    expect(
      extractM3uEpgUrls(
        '#EXTM3U url-tvg="https://epg.example/first.xml"\n#EXTM3U url-tvg="https://epg.example/second.xml"',
      ),
    ).toEqual(['https://epg.example/first.xml'])
  })
})
