import type { IptvChannel, IptvList } from '../iptv/iptv-repository'
import {
  fetchGuideFromUrls,
  importGuideFile,
  type EpgFetchResult,
} from './epg-fetch-service'
import {
  createEpgRepository,
  EPG_FRESH_MS,
  type EpgListCache,
  type EpgRepository,
  type EpgSourceRecord,
} from './epg-repository'
import { deriveGuideRows } from './guide-derivation'
import type { GuideChannelRow } from './guide-types'

export type GuideSnapshot = {
  status: 'loading' | 'ready' | 'unavailable'
  activeListId: string | null
  selectedDate: string
  channels: GuideChannelRow[]
  unmatchedChannelCount: number
  fetchedAt?: number
  refreshing: boolean
  sourceMode?: 'url' | 'file'
  warningMessage?: string
  errorMessage?: string
}

type IptvGuideState = {
  lists: readonly IptvList[]
  activeListId: string | null
  channels: readonly IptvChannel[]
}

export type GuideControllerDependencies = {
  repositoryFactory?: () => Promise<EpgRepository>
  fetchGuideFromUrls?: typeof fetchGuideFromUrls
  importGuideFile?: typeof importGuideFile
  now?: () => number
  dateKey?: (epoch: number) => string
}

function defaultDateKey(epoch: number) {
  const date = new Date(epoch)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function initialSnapshot(
  now: number,
  dateKey: (epoch: number) => string,
): GuideSnapshot {
  return {
    status: 'loading',
    activeListId: null,
    selectedDate: dateKey(now),
    channels: [],
    unmatchedChannelCount: 0,
    refreshing: false,
  }
}

function message(error: unknown) {
  return error instanceof Error ? error.message : 'TV rehberi işlemi başarısız.'
}

export class GuideController {
  private readonly repositoryFactory: () => Promise<EpgRepository>
  private readonly fetchUrls: typeof fetchGuideFromUrls
  private readonly importFileSource: typeof importGuideFile
  private readonly now: () => number
  private readonly dateKey: (epoch: number) => string
  private readonly listeners = new Set<() => void>()
  private repository: EpgRepository | null = null
  private initialized = false
  private initialization: Promise<void> | null = null
  private iptvState: IptvGuideState = {
    lists: [],
    activeListId: null,
    channels: [],
  }
  private cache: EpgListCache = { sources: [], channels: [], programmes: [] }
  private snapshot: GuideSnapshot

  constructor(dependencies: GuideControllerDependencies = {}) {
    this.repositoryFactory =
      dependencies.repositoryFactory ?? createEpgRepository
    this.fetchUrls = dependencies.fetchGuideFromUrls ?? fetchGuideFromUrls
    this.importFileSource = dependencies.importGuideFile ?? importGuideFile
    this.now = dependencies.now ?? Date.now
    this.dateKey = dependencies.dateKey ?? defaultDateKey
    this.snapshot = initialSnapshot(this.now(), this.dateKey)
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(snapshot: GuideSnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }

  private activeList() {
    return (
      this.iptvState.lists.find(
        ({ id }) => id === this.iptvState.activeListId,
      ) ?? null
    )
  }

  private requireRepository() {
    if (!this.repository)
      throw new Error('TV rehberi önbelleği kullanılamıyor.')
    return this.repository
  }

  private snapshotFromCache(
    cache: EpgListCache,
    options: {
      refreshing?: boolean
      warningMessage?: string
      errorMessage?: string
    } = {},
  ): GuideSnapshot {
    const rows = deriveGuideRows({
      iptvChannels: this.iptvState.channels,
      sources: cache.sources,
      epgChannels: cache.channels,
      programmes: cache.programmes,
      selectedDate: this.snapshot.selectedDate,
      now: this.now(),
      dateKey: this.dateKey,
    })
    const fetchedAt =
      cache.sources.length > 0
        ? Math.min(...cache.sources.map(({ fetchedAt }) => fetchedAt))
        : undefined
    const sourceMode = cache.sources[0]?.sourceType
    return {
      status: 'ready',
      activeListId: this.iptvState.activeListId,
      selectedDate: this.snapshot.selectedDate,
      channels: rows,
      unmatchedChannelCount: rows.filter(({ match }) => match === 'none')
        .length,
      ...(fetchedAt !== undefined ? { fetchedAt } : {}),
      refreshing: options.refreshing ?? false,
      ...(sourceMode ? { sourceMode } : {}),
      ...(options.warningMessage
        ? { warningMessage: options.warningMessage }
        : {}),
      ...(options.errorMessage ? { errorMessage: options.errorMessage } : {}),
    }
  }

  private async persistResult(list: IptvList, result: EpgFetchResult) {
    const repository = this.requireRepository()
    const fetchedAt = this.now()
    await repository.replaceListSources({
      listId: list.id,
      now: fetchedAt,
      sources: result.sources.map(({ sourceUrl, parsed }, position) => {
        const sourceKey = JSON.stringify([
          list.id,
          result.mode,
          position,
          sourceUrl ?? 'local-file',
        ])
        const source: EpgSourceRecord = {
          sourceKey,
          listId: list.id,
          sourceType: result.mode,
          ...(sourceUrl ? { sourceUrl } : {}),
          position,
          fetchedAt,
          channelCount: parsed.channels.length,
          programmeCount: parsed.programmes.length,
          warningCount: parsed.warnings.length,
        }
        return {
          source,
          channels: parsed.channels,
          programmes: parsed.programmes,
        }
      }),
    })
    this.cache = await repository.readListCache(list.id)
    this.emit(
      this.snapshotFromCache(this.cache, {
        ...(result.warnings.length > 0
          ? { warningMessage: result.warnings.join(' · ') }
          : {}),
      }),
    )
  }

  private async loadActiveCache() {
    const list = this.activeList()
    if (!list) {
      this.cache = { sources: [], channels: [], programmes: [] }
      this.emit({
        status: 'ready',
        activeListId: null,
        selectedDate: this.snapshot.selectedDate,
        channels: [],
        unmatchedChannelCount: 0,
        refreshing: false,
      })
      return
    }

    this.cache = await this.requireRepository().readListCache(list.id)
    this.emit(this.snapshotFromCache(this.cache))

    if (this.cache.sources.length === 0) {
      if (list.epgUrls.length === 0) return
      try {
        await this.refresh({ force: true })
      } catch (error) {
        this.emit(
          this.snapshotFromCache(this.cache, {
            errorMessage: message(error),
          }),
        )
      }
      return
    }

    const fetchedAt = Math.min(
      ...this.cache.sources.map(({ fetchedAt }) => fetchedAt),
    )
    const stale = this.now() - fetchedAt >= EPG_FRESH_MS
    const sourceMode = this.cache.sources[0]?.sourceType
    if (stale && sourceMode === 'url' && list.epgUrls.length > 0) {
      void this.refresh({ force: true }).catch(() => undefined)
    }
  }

  async initialize(input: IptvGuideState) {
    this.iptvState = input
    if (this.initialization) return await this.initialization
    this.initialization = (async () => {
      try {
        this.repository = await this.repositoryFactory()
        await this.repository.removeOrphanLists(input.lists.map(({ id }) => id))
        this.initialized = true
        await this.loadActiveCache()
      } catch (error) {
        this.repository = null
        this.emit({
          ...initialSnapshot(this.now(), this.dateKey),
          status: 'unavailable',
          activeListId: input.activeListId,
          errorMessage: message(error),
        })
      }
    })()
    return await this.initialization
  }

  async setIptvState(input: IptvGuideState) {
    const previousListId = this.iptvState.activeListId
    this.iptvState = input
    if (!this.initialized) return
    if (previousListId !== input.activeListId) {
      await this.loadActiveCache()
      return
    }
    if (this.repository && input.activeListId) {
      this.emit(this.snapshotFromCache(this.cache))
    } else if (!input.activeListId) {
      await this.loadActiveCache()
    }
  }

  async refresh(options: { force?: boolean; switchToUrlMode?: boolean } = {}) {
    const list = this.activeList()
    if (!list) throw new Error('EPG yenilenecek IPTV listesi seçili değil.')
    const currentMode = this.cache.sources[0]?.sourceType
    if (currentMode === 'file' && !options.switchToUrlMode) {
      throw new Error(
        'Dosyadan yüklenen rehber otomatik yenilenemez. URL’lerden yenilemeyi seç.',
      )
    }
    if (list.epgUrls.length === 0) {
      throw new Error('Seçili IPTV listesinde XMLTV adresi yok.')
    }
    const fetchedAt = this.snapshot.fetchedAt
    if (
      !options.force &&
      currentMode === 'url' &&
      fetchedAt !== undefined &&
      this.now() - fetchedAt < EPG_FRESH_MS
    ) {
      return
    }

    this.emit(this.snapshotFromCache(this.cache, { refreshing: true }))
    try {
      const result = await this.fetchUrls({ list })
      await this.persistResult(list, result)
    } catch (error) {
      this.emit(
        this.snapshotFromCache(this.cache, {
          warningMessage: message(error),
        }),
      )
      throw error
    }
  }

  async importFile(file: File) {
    const list = this.activeList()
    if (!list) throw new Error('XMLTV dosyası için IPTV listesi seçili değil.')
    const result = await this.importFileSource(file)
    await this.persistResult(list, result)
  }

  selectDate(dateKey: string) {
    this.snapshot = { ...this.snapshot, selectedDate: dateKey }
    this.emit(this.snapshotFromCache(this.cache))
  }
}

export function createGuideController(
  dependencies: GuideControllerDependencies = {},
) {
  return new GuideController(dependencies)
}
