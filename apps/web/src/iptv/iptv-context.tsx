import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'

import {
  importIptvFromFile,
  importIptvFromText,
  importIptvFromUrl,
  type IptvImportResult,
} from './iptv-import-service'
import {
  createIptvRepository,
  type ImportIptvListInput,
  type IptvChannel,
  type IptvList,
  type IptvRepository,
} from './iptv-repository'

export type IptvSnapshot = {
  status: 'loading' | 'ready' | 'unavailable'
  lists: readonly IptvList[]
  activeListId: string | null
  channels: readonly IptvChannel[]
  errorMessage?: string
}

export type IptvImporters = {
  fromUrl(url: string): Promise<IptvImportResult>
  fromFile(file: File): Promise<IptvImportResult>
  fromText(text: string): IptvImportResult
}

type IptvRepositoryFactory = () => Promise<IptvRepository>

const DEFAULT_IMPORTERS: IptvImporters = {
  fromUrl: (url) => importIptvFromUrl(url),
  fromFile: (file) => importIptvFromFile(file),
  fromText: (text) => importIptvFromText(text),
}

const INITIAL_SNAPSHOT: IptvSnapshot = {
  status: 'loading',
  lists: [],
  activeListId: null,
  channels: [],
}

function importInput(
  result: IptvImportResult,
  source: {
    name?: string
    sourceType: ImportIptvListInput['sourceType']
    sourceUrl?: string
  },
): ImportIptvListInput {
  return {
    name: source.name?.trim() || result.suggestedName,
    sourceType: source.sourceType,
    ...(source.sourceUrl ? { sourceUrl: source.sourceUrl } : {}),
    epgUrls: result.playlist.epgUrls,
    channels: result.playlist.channels,
  }
}

export class IptvController {
  private snapshot: IptvSnapshot = INITIAL_SNAPSHOT
  private repository: IptvRepository | null = null
  private initialization: Promise<void> | null = null
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly repositoryFactory: IptvRepositoryFactory,
    private readonly importers: IptvImporters,
  ) {}

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(snapshot: IptvSnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }

  private requireRepository() {
    if (!this.repository) throw new Error('IPTV kütüphanesi kullanılamıyor.')
    return this.repository
  }

  async initialize() {
    if (this.initialization) return await this.initialization
    this.initialization = (async () => {
      try {
        this.repository = await this.repositoryFactory()
        const lists = await this.repository.listLists()
        const activeListId = lists[0]?.id ?? null
        const channels = activeListId
          ? await this.repository.listChannels(activeListId)
          : []
        this.emit({ status: 'ready', lists, activeListId, channels })
      } catch {
        this.repository = null
        this.emit({ ...INITIAL_SNAPSHOT, status: 'unavailable' })
      }
    })()
    return await this.initialization
  }

  private async selectImportedList(list: IptvList) {
    const repository = this.requireRepository()
    const [lists, channels] = await Promise.all([
      repository.listLists(),
      repository.listChannels(list.id),
    ])
    this.emit({ status: 'ready', lists, activeListId: list.id, channels })
  }

  async importUrl(url: string, name?: string) {
    const result = await this.importers.fromUrl(url)
    const list = await this.requireRepository().importList(
      importInput(result, { name, sourceType: 'url', sourceUrl: url }),
    )
    await this.selectImportedList(list)
  }

  async importFile(file: File, name?: string) {
    const result = await this.importers.fromFile(file)
    const list = await this.requireRepository().importList(
      importInput(result, { name, sourceType: 'file' }),
    )
    await this.selectImportedList(list)
  }

  async importText(text: string, name?: string) {
    const result = this.importers.fromText(text)
    const list = await this.requireRepository().importList(
      importInput(result, { name, sourceType: 'paste' }),
    )
    await this.selectImportedList(list)
  }

  async selectList(id: string | null) {
    const repository = this.requireRepository()
    if (id === null) {
      this.emit({ ...this.snapshot, status: 'ready', activeListId: null, channels: [] })
      return
    }
    if (!this.snapshot.lists.some((list) => list.id === id)) {
      throw new Error('IPTV listesi bulunamadı.')
    }
    const channels = await repository.listChannels(id)
    this.emit({ ...this.snapshot, status: 'ready', activeListId: id, channels })
  }

  async refreshList(id: string) {
    const repository = this.requireRepository()
    const list = await repository.getList(id)
    if (!list) throw new Error('IPTV listesi bulunamadı.')
    if (list.sourceType !== 'url' || !list.sourceUrl) {
      throw new Error('Yalnız URL ile eklenen IPTV listeleri yenilenebilir.')
    }

    try {
      const result = await this.importers.fromUrl(list.sourceUrl)
      await repository.replaceList(
        id,
        importInput(result, {
          name: list.name,
          sourceType: 'url',
          sourceUrl: list.sourceUrl,
        }),
      )
      const lists = await repository.listLists()
      const channels =
        this.snapshot.activeListId === id
          ? await repository.listChannels(id)
          : this.snapshot.channels
      this.emit({
        status: 'ready',
        lists,
        activeListId: this.snapshot.activeListId,
        channels,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'IPTV listesi yenilenemedi.'
      this.emit({ ...this.snapshot, status: 'ready', errorMessage: message })
      throw error
    }
  }

  async deleteList(id: string) {
    const repository = this.requireRepository()
    await repository.deleteList(id)
    const lists = await repository.listLists()
    const currentStillExists = lists.some(
      (list) => list.id === this.snapshot.activeListId,
    )
    const activeListId = currentStillExists
      ? this.snapshot.activeListId
      : (lists[0]?.id ?? null)
    const channels = activeListId
      ? await repository.listChannels(activeListId)
      : []
    this.emit({ status: 'ready', lists, activeListId, channels })
  }
}

export function createIptvController(options: {
  repositoryFactory?: IptvRepositoryFactory
  importers?: IptvImporters
} = {}) {
  return new IptvController(
    options.repositoryFactory ?? createIptvRepository,
    options.importers ?? DEFAULT_IMPORTERS,
  )
}

export type IptvContextValue = IptvSnapshot & {
  importUrl(url: string, name?: string): Promise<void>
  importFile(file: File, name?: string): Promise<void>
  importText(text: string, name?: string): Promise<void>
  selectList(id: string | null): Promise<void>
  refreshList(id: string): Promise<void>
  deleteList(id: string): Promise<void>
}

const IptvContext = createContext<IptvContextValue | null>(null)

type IptvProviderProps = PropsWithChildren<{
  repositoryFactory?: IptvRepositoryFactory
  importers?: IptvImporters
}>

export function IptvProvider({
  children,
  repositoryFactory = createIptvRepository,
  importers = DEFAULT_IMPORTERS,
}: IptvProviderProps) {
  const controller = useMemo(
    () => createIptvController({ repositoryFactory, importers }),
    [repositoryFactory, importers],
  )
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )

  useEffect(() => {
    void controller.initialize()
  }, [controller])

  const value = useMemo<IptvContextValue>(
    () => ({
      ...snapshot,
      importUrl: (url, name) => controller.importUrl(url, name),
      importFile: (file, name) => controller.importFile(file, name),
      importText: (text, name) => controller.importText(text, name),
      selectList: (id) => controller.selectList(id),
      refreshList: (id) => controller.refreshList(id),
      deleteList: (id) => controller.deleteList(id),
    }),
    [controller, snapshot],
  )

  return <IptvContext.Provider value={value}>{children}</IptvContext.Provider>
}

export function useIptv() {
  const context = useContext(IptvContext)
  if (!context) throw new Error('useIptv, IptvProvider içinde kullanılmalı.')
  return context
}
