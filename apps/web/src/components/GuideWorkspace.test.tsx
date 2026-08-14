import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { GuideContextValue } from '../guide/guide-context'
import type { GuideProgramme } from '../guide/guide-types'
import type { IptvContextValue } from '../iptv/iptv-context'
import type { IptvChannel, IptvList } from '../iptv/iptv-repository'
import { GuideWorkspaceView } from './GuideWorkspace'

const NOW = Date.UTC(2026, 7, 14, 12, 30, 0)

const list: IptvList = {
  id: 'list-1',
  name: 'Haber Listesi',
  sourceType: 'url',
  sourceUrl: 'https://provider.example/list.m3u',
  epgUrls: ['https://provider.example/guide.xml'],
  importedAt: 1,
  updatedAt: 2,
  channelCount: 2,
}

const news: IptvChannel = {
  id: 'news',
  listId: list.id,
  position: 0,
  name: 'Haber TV',
  tvgId: 'news',
  streamUrl: 'https://stream.example/news.m3u8',
  searchText: 'haber tv',
}

const sports: IptvChannel = {
  ...news,
  id: 'sports',
  position: 1,
  name: 'Spor TV',
  tvgId: 'sports',
  streamUrl: 'https://stream.example/sports.m3u8',
  searchText: 'spor tv',
}

function programme(
  id: string,
  title: string,
  startAt: number,
  stopAt: number,
): GuideProgramme {
  return {
    id,
    sourceKey: 'source',
    xmltvChannelId: 'news',
    startAt,
    stopAt,
    title,
    description: `${title} açıklaması`,
    categories: ['Haber'],
  }
}

function iptv(overrides: Partial<IptvContextValue> = {}): IptvContextValue {
  return {
    status: 'ready',
    lists: [list],
    activeListId: list.id,
    channels: [news, sports],
    importUrl: async () => {},
    importFile: async () => {},
    importText: async () => {},
    selectList: async () => {},
    refreshList: async () => {},
    deleteList: async () => {},
    ...overrides,
  }
}

function guide(overrides: Partial<GuideContextValue> = {}): GuideContextValue {
  const current = programme(
    'current',
    'Öğle Haberleri',
    NOW - 30 * 60_000,
    NOW + 30 * 60_000,
  )
  const next = programme(
    'next',
    'Ekonomi Gündemi',
    NOW + 30 * 60_000,
    NOW + 90 * 60_000,
  )
  return {
    status: 'ready',
    activeListId: list.id,
    selectedDate: '2026-08-14',
    channels: [
      {
        channel: news,
        match: 'exact-id',
        current,
        next,
        progress: 0.5,
        programmes: [current, next],
      },
      {
        channel: sports,
        match: 'none',
        current: null,
        next: null,
        progress: null,
        programmes: [],
      },
    ],
    unmatchedChannelCount: 1,
    fetchedAt: NOW - 60 * 60_000,
    refreshing: false,
    sourceMode: 'url',
    initialize: async () => {},
    refresh: async () => {},
    importFile: async () => {},
    selectDate: () => {},
    tick: () => {},
    selectList: async () => {},
    ...overrides,
  }
}

const actions = {
  onSelectList: vi.fn(),
  onRefresh: vi.fn(),
  onRefreshUrls: vi.fn(),
  onFileChange: vi.fn(),
  onSelectDate: vi.fn(),
  onPlayChannel: vi.fn(),
}

describe('GuideWorkspaceView', () => {
  it('renders no-list state without pretending guide data exists', () => {
    const markup = renderToStaticMarkup(
      <GuideWorkspaceView
        guide={guide({ activeListId: null, channels: [] })}
        iptv={iptv({ lists: [], activeListId: null, channels: [] })}
        now={NOW}
        {...actions}
      />,
    )

    expect(markup).toContain('Önce bir IPTV listesi ekle')
    expect(markup).toContain('/iptv')
  })

  it('offers local XMLTV import when the selected IPTV list declares no EPG URL', () => {
    const noEpgList = { ...list, epgUrls: [] }
    const markup = renderToStaticMarkup(
      <GuideWorkspaceView
        guide={guide({ channels: [], fetchedAt: undefined })}
        iptv={iptv({ lists: [noEpgList] })}
        now={NOW}
        {...actions}
      />,
    )

    expect(markup).toContain('XMLTV adresi tanımlı değil')
    expect(markup).toContain('XMLTV dosyası seç')
  })

  it('renders seven guide days, now/next, unmatched channels, and play actions', () => {
    const markup = renderToStaticMarkup(
      <GuideWorkspaceView
        guide={guide()}
        iptv={iptv()}
        now={NOW}
        {...actions}
      />,
    )

    expect((markup.match(/class="guide-date-button/g) ?? []).length).toBe(7)
    expect(markup).toContain('Bugün')
    expect(markup).toContain('Şimdi')
    expect(markup).toContain('Öğle Haberleri')
    expect(markup).toContain('Sıradaki')
    expect(markup).toContain('Ekonomi Gündemi')
    expect(markup).toContain('EPG yok')
    expect(markup).toContain('Kanalı oynat')
    expect(markup).toContain('Öğle Haberleri açıklaması')
  })

  it('shows stale warnings and explicit URL switch for file-backed guide mode', () => {
    const markup = renderToStaticMarkup(
      <GuideWorkspaceView
        guide={guide({
          sourceMode: 'file',
          warningMessage: 'Son yenileme başarısız; eski rehber gösteriliyor.',
        })}
        iptv={iptv()}
        now={NOW}
        {...actions}
      />,
    )

    expect(markup).toContain('Dosyadan yüklenen rehber')
    expect(markup).toContain('URL’lerden yenile')
    expect(markup).toContain('eski rehber gösteriliyor')
  })

  it('shows a foreground guide-load error when no cache could be loaded', () => {
    const markup = renderToStaticMarkup(
      <GuideWorkspaceView
        guide={guide({
          channels: [],
          fetchedAt: undefined,
          errorMessage: 'XMLTV kaynaklarının hiçbiri alınamadı.',
        })}
        iptv={iptv()}
        now={NOW}
        {...actions}
      />,
    )

    expect(markup).toContain('XMLTV kaynaklarının hiçbiri alınamadı.')
  })
})
