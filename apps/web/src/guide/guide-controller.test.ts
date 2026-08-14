import { describe, expect, it, vi } from 'vitest'

import type { ParsedXmltv } from '@livetv/shared'
import type { IptvChannel, IptvList } from '../iptv/iptv-repository'
import {
  GuideController,
  type GuideControllerDependencies,
} from './guide-controller'
import {
  EPG_FRESH_MS,
  type EpgListCache,
  type EpgRepository,
  type EpgSourceRecord,
} from './epg-repository'
import type { EpgFetchResult } from './epg-fetch-service'

const NOW = Date.UTC(2026, 7, 14, 12, 0, 0)

const iptvList: IptvList = {
  id: 'list-1',
  name: 'Main',
  sourceType: 'url',
  sourceUrl: 'https://provider.example/list.m3u',
  epgUrls: ['https://provider.example/guide.xml'],
  importedAt: 1,
  updatedAt: 1,
  channelCount: 1,
}

const iptvChannel: IptvChannel = {
  id: 'iptv-news',
  listId: 'list-1',
  position: 0,
  name: 'News',
  tvgId: 'news',
  streamUrl: 'https://stream.example/news.m3u8',
  searchText: 'news',
}

function parsed(title = 'Cached'): ParsedXmltv {
  return {
    channels: [{ id: 'news', displayNames: ['News'] }],
    programmes: [
      {
        channelId: 'news',
        startAt: NOW - 30 * 60_000,
        stopAt: NOW + 30 * 60_000,
        title,
        categories: [],
      },
    ],
    warnings: [],
  }
}

function cache(
  sourceType: EpgSourceRecord['sourceType'],
  fetchedAt: number,
  title = 'Cached',
): EpgListCache {
  return {
    sources: [
      {
        sourceKey: 'source',
        listId: 'list-1',
        sourceType,
        ...(sourceType === 'url'
          ? { sourceUrl: 'https://provider.example/guide.xml' }
          : {}),
        position: 0,
        fetchedAt,
        channelCount: 1,
        programmeCount: 1,
        warningCount: 0,
      },
    ],
    channels: [
      {
        id: 'source-news',
        sourceKey: 'source',
        xmltvId: 'news',
        displayNames: ['News'],
      },
    ],
    programmes: [
      {
        id: `source-news-${title}`,
        sourceKey: 'source',
        xmltvChannelId: 'news',
        startAt: NOW - 30 * 60_000,
        stopAt: NOW + 30 * 60_000,
        title,
        categories: [],
      },
    ],
  }
}

function fetchResult(title = 'Fresh'): EpgFetchResult {
  return {
    mode: 'url',
    sources: [
      {
        sourceUrl: 'https://provider.example/guide.xml',
        parsed: parsed(title),
      },
    ],
    warnings: [],
  }
}

function dependencies(initialCache: EpgListCache): {
  deps: GuideControllerDependencies
  repository: EpgRepository
  fetchUrls: ReturnType<typeof vi.fn>
  importFile: ReturnType<typeof vi.fn>
  removeOrphans: ReturnType<typeof vi.fn>
} {
  let stored = initialCache
  const removeOrphans = vi.fn(async () => {})
  const replaceListSources: EpgRepository['replaceListSources'] = async ({
    listId,
    sources,
  }) => {
    stored = {
      sources: sources.map(({ source }) => source),
      channels: sources.flatMap(({ source, channels }) =>
        channels.map((channel) => ({
          id: `${source.sourceKey}-${channel.id}`,
          sourceKey: source.sourceKey,
          xmltvId: channel.id,
          displayNames: channel.displayNames,
        })),
      ),
      programmes: sources.flatMap(({ source, programmes }) =>
        programmes.map((programme) => ({
          id: `${source.sourceKey}-${programme.title}`,
          sourceKey: source.sourceKey,
          xmltvChannelId: programme.channelId,
          startAt: programme.startAt,
          stopAt: programme.stopAt,
          title: programme.title,
          categories: programme.categories,
        })),
      ),
    }
    expect(listId).toBe('list-1')
  }
  const repository: EpgRepository = {
    replaceListSources: vi.fn(replaceListSources),
    readListCache: vi.fn(async () => stored),
    deleteListCache: vi.fn(async () => {}),
    removeOrphanLists: removeOrphans,
  }
  const fetchUrls = vi.fn(async () => fetchResult())
  const importFile = vi.fn(async () => ({
    ...fetchResult('File'),
    mode: 'file' as const,
  }))
  return {
    repository,
    fetchUrls,
    importFile,
    removeOrphans,
    deps: {
      repositoryFactory: async () => repository,
      fetchGuideFromUrls: fetchUrls,
      importGuideFile: importFile,
      now: () => NOW,
      dateKey: (epoch) => new Date(epoch).toISOString().slice(0, 10),
    },
  }
}

describe('GuideController', () => {
  it('initializes to a no-list ready state without fetching', async () => {
    const { deps, fetchUrls, removeOrphans } = dependencies({
      sources: [],
      channels: [],
      programmes: [],
    })
    const controller = new GuideController(deps)

    await controller.initialize({ lists: [], activeListId: null, channels: [] })

    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      activeListId: null,
      channels: [],
      refreshing: false,
    })
    expect(fetchUrls).not.toHaveBeenCalled()
    expect(removeOrphans).toHaveBeenCalledWith([])
  })

  it('renders fresh cache without network refresh', async () => {
    const { deps, fetchUrls } = dependencies(
      cache('url', NOW - EPG_FRESH_MS + 1),
    )
    const controller = new GuideController(deps)

    await controller.initialize({
      lists: [iptvList],
      activeListId: iptvList.id,
      channels: [iptvChannel],
    })

    expect(controller.getSnapshot().channels[0]?.current?.title).toBe('Cached')
    expect(fetchUrls).not.toHaveBeenCalled()
  })

  it('renders stale cache immediately and refreshes URL mode in the background', async () => {
    let resolveFetch!: (value: EpgFetchResult) => void
    const deferred = new Promise<EpgFetchResult>((resolve) => {
      resolveFetch = resolve
    })
    const fixture = dependencies(cache('url', NOW - EPG_FRESH_MS - 1))
    fixture.fetchUrls.mockImplementationOnce(async () => await deferred)
    const controller = new GuideController(fixture.deps)

    await controller.initialize({
      lists: [iptvList],
      activeListId: iptvList.id,
      channels: [iptvChannel],
    })

    expect(controller.getSnapshot().channels[0]?.current?.title).toBe('Cached')
    expect(controller.getSnapshot().refreshing).toBe(true)
    resolveFetch(fetchResult('Fresh'))
    await vi.waitFor(() => {
      expect(controller.getSnapshot().channels[0]?.current?.title).toBe('Fresh')
    })
  })

  it('preserves stale cache and surfaces a warning after refresh failure', async () => {
    const fixture = dependencies(cache('url', NOW - EPG_FRESH_MS - 1))
    fixture.fetchUrls.mockRejectedValue(new Error('upstream down'))
    const controller = new GuideController(fixture.deps)
    await controller.initialize({
      lists: [iptvList],
      activeListId: iptvList.id,
      channels: [iptvChannel],
    })

    await expect(controller.refresh({ force: true })).rejects.toThrow(
      'upstream down',
    )
    expect(controller.getSnapshot().channels[0]?.current?.title).toBe('Cached')
    expect(controller.getSnapshot().warningMessage).toContain('upstream down')
  })

  it('does not background-refresh stale file mode but can explicitly switch back to URL mode', async () => {
    const fixture = dependencies(cache('file', NOW - EPG_FRESH_MS - 1))
    const controller = new GuideController(fixture.deps)
    await controller.initialize({
      lists: [iptvList],
      activeListId: iptvList.id,
      channels: [iptvChannel],
    })

    expect(controller.getSnapshot().sourceMode).toBe('file')
    expect(fixture.fetchUrls).not.toHaveBeenCalled()

    await controller.refresh({ force: true, switchToUrlMode: true })
    expect(fixture.fetchUrls).toHaveBeenCalledOnce()
    expect(controller.getSnapshot().sourceMode).toBe('url')
  })

  it('imports a local file and keeps selected-date derivation local', async () => {
    const fixture = dependencies({ sources: [], channels: [], programmes: [] })
    const controller = new GuideController(fixture.deps)
    await controller.initialize({
      lists: [iptvList],
      activeListId: iptvList.id,
      channels: [iptvChannel],
    })

    await controller.importFile(new File(['x'], 'guide.xml'))
    controller.selectDate('2026-08-15')

    expect(fixture.importFile).toHaveBeenCalledOnce()
    expect(controller.getSnapshot()).toMatchObject({
      sourceMode: 'file',
      selectedDate: '2026-08-15',
    })
  })
})
