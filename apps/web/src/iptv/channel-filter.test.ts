import { describe, expect, it } from 'vitest'

import { filterIptvChannels, listIptvGroups } from './channel-filter'
import type { ParsedIptvChannel } from './m3u-types'

const channels: ParsedIptvChannel[] = [
  {
    name: 'Halk Haber',
    streamUrl: 'https://haber.example/live.m3u8',
    tvgId: 'halk.tr',
    tvgName: 'Halk TV',
    groupTitle: 'Haber',
  },
  {
    name: 'Arena Spor',
    streamUrl: 'https://sport.example/arena.m3u8',
    groupTitle: 'Spor',
  },
  {
    name: 'Yerel Kanal',
    streamUrl: 'https://ankara.example/live',
  },
]

describe('IPTV channel filtering', () => {
  it('searches case-insensitively across metadata and stream host while preserving order', () => {
    expect(
      filterIptvChannels(channels, { query: 'HALK.TR', group: null }).map(
        ({ name }) => name,
      ),
    ).toEqual(['Halk Haber'])
    expect(
      filterIptvChannels(channels, { query: 'sport.example', group: null }).map(
        ({ name }) => name,
      ),
    ).toEqual(['Arena Spor'])
  })

  it('filters exact groups and the ungrouped sentinel', () => {
    expect(
      filterIptvChannels(channels, { query: '', group: 'Spor' }).map(
        ({ name }) => name,
      ),
    ).toEqual(['Arena Spor'])
    expect(
      filterIptvChannels(channels, { query: '', group: '' }).map(
        ({ name }) => name,
      ),
    ).toEqual(['Yerel Kanal'])
  })

  it('lists unique groups alphabetically and includes the ungrouped sentinel last', () => {
    expect(listIptvGroups(channels)).toEqual(['Haber', 'Spor', ''])
  })
})
