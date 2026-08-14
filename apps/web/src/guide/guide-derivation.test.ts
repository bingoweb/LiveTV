import { describe, expect, it } from 'vitest'

import type { IptvChannel } from '../iptv/iptv-repository'
import { deriveGuideRows } from './guide-derivation'
import type {
  EpgChannelRecord,
  EpgProgrammeRecord,
  EpgSourceRecord,
} from './epg-repository'

const NOW = Date.UTC(2026, 7, 14, 12, 30, 0)

const channel: IptvChannel = {
  id: 'iptv-news',
  listId: 'list',
  position: 0,
  name: 'News',
  tvgId: 'news',
  streamUrl: 'https://stream.example/news.m3u8',
  searchText: 'news',
}

const sources: EpgSourceRecord[] = [
  {
    sourceKey: 'first',
    listId: 'list',
    sourceType: 'url',
    sourceUrl: 'https://epg.example/first.xml',
    position: 0,
    fetchedAt: NOW,
    channelCount: 1,
    programmeCount: 2,
    warningCount: 0,
  },
  {
    sourceKey: 'second',
    listId: 'list',
    sourceType: 'url',
    sourceUrl: 'https://epg.example/second.xml',
    position: 1,
    fetchedAt: NOW,
    channelCount: 1,
    programmeCount: 1,
    warningCount: 0,
  },
]

const epgChannels: EpgChannelRecord[] = [
  {
    id: 'first-news',
    sourceKey: 'first',
    xmltvId: 'news',
    displayNames: ['News'],
  },
  {
    id: 'second-news',
    sourceKey: 'second',
    xmltvId: 'news',
    displayNames: ['News'],
  },
]

function programme(
  sourceKey: string,
  title: string,
  startAt: number,
  stopAt: number,
): EpgProgrammeRecord {
  return {
    id: JSON.stringify([sourceKey, 'news', startAt, stopAt, title]),
    sourceKey,
    xmltvChannelId: 'news',
    startAt,
    stopAt,
    title,
    categories: [],
  }
}

const dateKey = (epoch: number) => new Date(epoch).toISOString().slice(0, 10)

describe('guide row derivation', () => {
  it('derives current, next, progress, and selected-day programme rows', () => {
    const rows = deriveGuideRows({
      iptvChannels: [channel],
      sources,
      epgChannels,
      programmes: [
        programme('first', 'Current', NOW - 30 * 60_000, NOW + 30 * 60_000),
        programme('first', 'Next', NOW + 30 * 60_000, NOW + 90 * 60_000),
        programme(
          'first',
          'Tomorrow',
          NOW + 24 * 60 * 60_000,
          NOW + 25 * 60 * 60_000,
        ),
      ],
      selectedDate: dateKey(NOW),
      now: NOW,
      dateKey,
    })

    expect(rows[0]).toMatchObject({
      channel: { id: 'iptv-news' },
      current: { title: 'Current' },
      next: { title: 'Next' },
      progress: 0.5,
    })
    expect(rows[0]?.programmes.map(({ title }) => title)).toEqual([
      'Current',
      'Next',
    ])
  })

  it('uses earlier source priority when duplicate schedules map to the same IPTV channel', () => {
    const duplicateStart = NOW - 10 * 60_000
    const duplicateStop = NOW + 20 * 60_000
    const rows = deriveGuideRows({
      iptvChannels: [channel],
      sources,
      epgChannels,
      programmes: [
        programme('second', 'Same Show', duplicateStart, duplicateStop),
        programme('first', 'Same Show', duplicateStart, duplicateStop),
      ],
      selectedDate: dateKey(NOW),
      now: NOW,
      dateKey,
    })

    expect(rows[0]?.programmes).toHaveLength(1)
    expect(rows[0]?.programmes[0]?.sourceKey).toBe('first')
  })

  it('keeps unmatched IPTV channels visible and playable', () => {
    const unmatched = {
      ...channel,
      id: 'unmatched',
      tvgId: 'missing',
      name: 'No EPG',
    }
    const rows = deriveGuideRows({
      iptvChannels: [unmatched],
      sources,
      epgChannels,
      programmes: [],
      selectedDate: dateKey(NOW),
      now: NOW,
      dateKey,
    })

    expect(rows).toEqual([
      expect.objectContaining({
        channel: expect.objectContaining({ id: 'unmatched' }),
        match: 'none',
        current: null,
        next: null,
        programmes: [],
      }),
    ])
  })
})
