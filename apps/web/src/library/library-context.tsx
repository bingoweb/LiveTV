import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react'

import {
  createLibraryRepository,
  type FavoriteEntry,
  type HistoryEntry,
  type LibraryRepository,
  type Playlist,
  type PlaylistItem,
} from './library-repository'
import type { LibrarySource } from './library-types'

export type LibraryStatus = 'loading' | 'ready' | 'unavailable'

type LibrarySnapshot = {
  status: LibraryStatus
  history: readonly HistoryEntry[]
  favorites: readonly FavoriteEntry[]
  playlists: readonly Playlist[]
}

export type LibraryRepositoryFactory = () => Promise<LibraryRepository>

const INITIAL_SNAPSHOT: LibrarySnapshot = {
  status: 'loading',
  history: [],
  favorites: [],
  playlists: [],
}

export class LibraryController {
  private snapshot: LibrarySnapshot = INITIAL_SNAPSHOT
  private repository: LibraryRepository | null = null
  private initialization: Promise<void> | null = null
  private readonly listeners = new Set<() => void>()

  constructor(private readonly repositoryFactory: LibraryRepositoryFactory) {}

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(snapshot: LibrarySnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }

  async initialize() {
    if (this.initialization) return await this.initialization

    this.initialization = (async () => {
      try {
        this.repository = await this.repositoryFactory()
        await this.refresh()
      } catch {
        this.repository = null
        this.emit({ ...INITIAL_SNAPSHOT, status: 'unavailable' })
      }
    })()

    return await this.initialization
  }

  private requireRepository() {
    if (!this.repository) {
      throw new Error('Yerel kütüphane kullanılamıyor.')
    }
    return this.repository
  }

  async refresh() {
    const repository = this.requireRepository()
    const [history, favorites, playlists] = await Promise.all([
      repository.listHistory(),
      repository.listFavorites(),
      repository.listPlaylists(),
    ])
    this.emit({ status: 'ready', history, favorites, playlists })
  }

  async recordPlayback(source: LibrarySource) {
    const repository = this.requireRepository()
    await repository.recordPlayback(source)
    const history = await repository.listHistory()
    this.emit({ ...this.snapshot, status: 'ready', history })
  }

  async toggleFavorite(source: LibrarySource) {
    const repository = this.requireRepository()
    if (await repository.isFavorite(source.sourceKey)) {
      await repository.removeFavorite(source.sourceKey)
    } else {
      await repository.addFavorite(source)
    }
    const favorites = await repository.listFavorites()
    this.emit({ ...this.snapshot, status: 'ready', favorites })
  }

  async createPlaylist(name: string) {
    const repository = this.requireRepository()
    const playlist = await repository.createPlaylist(name)
    const playlists = await repository.listPlaylists()
    this.emit({ ...this.snapshot, status: 'ready', playlists })
    return playlist
  }

  async renamePlaylist(id: string, name: string) {
    const repository = this.requireRepository()
    await repository.renamePlaylist(id, name)
    const playlists = await repository.listPlaylists()
    this.emit({ ...this.snapshot, status: 'ready', playlists })
  }

  async deletePlaylist(id: string) {
    const repository = this.requireRepository()
    await repository.deletePlaylist(id)
    const playlists = await repository.listPlaylists()
    this.emit({ ...this.snapshot, status: 'ready', playlists })
  }

  async addToPlaylist(playlistId: string, source: LibrarySource) {
    const repository = this.requireRepository()
    await repository.addPlaylistItem(playlistId, source)
    const playlists = await repository.listPlaylists()
    this.emit({ ...this.snapshot, status: 'ready', playlists })
  }

  async removePlaylistItem(itemId: string) {
    await this.requireRepository().removePlaylistItem(itemId)
  }

  async reorderPlaylistItems(
    playlistId: string,
    orderedItemIds: readonly string[],
  ) {
    await this.requireRepository().reorderPlaylistItems(
      playlistId,
      orderedItemIds,
    )
  }

  async listPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
    return await this.requireRepository().listPlaylistItems(playlistId)
  }

  async removeHistory(sourceKey: string) {
    const repository = this.requireRepository()
    await repository.removeHistory(sourceKey)
    const history = await repository.listHistory()
    this.emit({ ...this.snapshot, status: 'ready', history })
  }

  async clearHistory() {
    const repository = this.requireRepository()
    await repository.clearHistory()
    this.emit({ ...this.snapshot, status: 'ready', history: [] })
  }
}

export function createLibraryController(factory: LibraryRepositoryFactory) {
  return new LibraryController(factory)
}

export type LibraryContextValue = LibrarySnapshot & {
  recordPlayback(source: LibrarySource): Promise<void>
  toggleFavorite(source: LibrarySource): Promise<void>
  createPlaylist(name: string): Promise<Playlist>
  renamePlaylist(id: string, name: string): Promise<void>
  deletePlaylist(id: string): Promise<void>
  addToPlaylist(playlistId: string, source: LibrarySource): Promise<void>
  removePlaylistItem(itemId: string): Promise<void>
  reorderPlaylistItems(
    playlistId: string,
    orderedItemIds: readonly string[],
  ): Promise<void>
  listPlaylistItems(playlistId: string): Promise<PlaylistItem[]>
  removeHistory(sourceKey: string): Promise<void>
  clearHistory(): Promise<void>
}

const LibraryContext = createContext<LibraryContextValue | null>(null)

type LibraryProviderProps = PropsWithChildren<{
  repositoryFactory?: LibraryRepositoryFactory
}>

export function LibraryProvider({
  children,
  repositoryFactory = createLibraryRepository,
}: LibraryProviderProps) {
  const controller = useMemo(
    () => createLibraryController(repositoryFactory),
    [repositoryFactory],
  )
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )

  useEffect(() => {
    void controller.initialize()
  }, [controller])

  const value = useMemo<LibraryContextValue>(
    () => ({
      ...snapshot,
      recordPlayback: (source) => controller.recordPlayback(source),
      toggleFavorite: (source) => controller.toggleFavorite(source),
      createPlaylist: (name) => controller.createPlaylist(name),
      renamePlaylist: (id, name) => controller.renamePlaylist(id, name),
      deletePlaylist: (id) => controller.deletePlaylist(id),
      addToPlaylist: (playlistId, source) =>
        controller.addToPlaylist(playlistId, source),
      removePlaylistItem: (itemId) => controller.removePlaylistItem(itemId),
      reorderPlaylistItems: (playlistId, ids) =>
        controller.reorderPlaylistItems(playlistId, ids),
      listPlaylistItems: (playlistId) =>
        controller.listPlaylistItems(playlistId),
      removeHistory: (sourceKey) => controller.removeHistory(sourceKey),
      clearHistory: () => controller.clearHistory(),
    }),
    [controller, snapshot],
  )

  return (
    <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
  )
}

export function useLibrary() {
  const library = useContext(LibraryContext)
  if (!library) throw new Error('useLibrary, LibraryProvider içinde kullanılmalı.')
  return library
}
