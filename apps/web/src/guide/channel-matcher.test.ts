import { describe, expect, it } from 'vitest'

import type { IptvChannel } from '../iptv/iptv-repository'
import { matchIptvChannelsToXmltv } from './channel-matcher'
import type { EpgChannelRecord } from './epg-repository'

function iptv(
  id: string,
  name: string,
  overrides: Partial<IptvChannel> = {},
): IptvChannel {
  return {
    id,
    listId: 'list',
    position: 0,
    name,
    streamUrl: `https://stream.example/${id}.m3u8`,
    searchText: name.toLowerCase(),
    ...overrides,
  }
}

function epg(
  sourceKey: string,
  xmltvId: string,
  displayNames: string[],
): EpgChannelRecord {
  return {
    id: JSON.stringify([sourceKey, xmltvId]),
    sourceKey,
    xmltvId,
    displayNames,
  }
}

describe('IPTV ↔ XMLTV channel matcher', () => {
  it('matches exact tvg-id across multiple EPG sources', () => {
    const matches = matchIptvChannelsToXmltv(
      [iptv('c1', 'News', { tvgId: 'news.tr' })],
      [epg('s1', 'news.tr', ['News']), epg('s2', 'news.tr', ['News HD'])],
    )

    expect(matches[0]).toMatchObject({ match: 'exact-id' })
    expect(matches[0]?.xmltvChannels.map(({ sourceKey }) => sourceKey)).toEqual(
      ['s1', 's2'],
    )
  })

  it('uses folded id only when the normalized XMLTV id is unique', () => {
    const unique = matchIptvChannelsToXmltv(
      [iptv('c1', 'News', { tvgId: 'NEWS.TR' })],
      [epg('s1', 'news.tr', ['News'])],
    )
    expect(unique[0]?.match).toBe('folded-id')

    const ambiguous = matchIptvChannelsToXmltv(
      [iptv('c1', 'News', { tvgId: 'NEWS.TR' })],
      [epg('s1', 'news.tr', ['News']), epg('s2', 'News.Tr', ['News'])],
    )
    expect(ambiguous[0]?.match).toBe('none')
  })

  it('falls back to unique normalized tvg-name and then channel name', () => {
    const byTvgName = matchIptvChannelsToXmltv(
      [iptv('c1', 'Different', { tvgName: '  Haber TV  ' })],
      [epg('s1', 'id1', ['Haber TV'])],
    )
    expect(byTvgName[0]?.match).toBe('display-name')

    const byName = matchIptvChannelsToXmltv(
      [iptv('c2', '«Spor 4K»')],
      [epg('s1', 'id2', ['Spor 4K'])],
    )
    expect(byName[0]?.match).toBe('display-name')
  })

  it('does not guess ambiguous display names or strip meaningful HD/4K tokens', () => {
    const ambiguous = matchIptvChannelsToXmltv(
      [iptv('c1', 'News')],
      [epg('s1', 'a', ['News']), epg('s1', 'b', ['News'])],
    )
    expect(ambiguous[0]?.match).toBe('none')

    const tokenDifference = matchIptvChannelsToXmltv(
      [iptv('c2', 'Sports HD')],
      [epg('s1', 'sports', ['Sports'])],
    )
    expect(tokenDifference[0]?.match).toBe('none')
  })

  it('does not let two weak IPTV matches silently claim the same XMLTV channel', () => {
    const matches = matchIptvChannelsToXmltv(
      [iptv('c1', 'News'), iptv('c2', 'News')],
      [epg('s1', 'news', ['News'])],
    )

    expect(matches.map(({ match }) => match)).toEqual(['display-name', 'none'])
  })
})
