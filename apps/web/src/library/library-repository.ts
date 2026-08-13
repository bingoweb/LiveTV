import type { LibrarySource } from './library-types'
import {
  deleteLibraryDatabase,
  LIBRARY_DATABASE_NAME,
  openLibraryDatabase,
} from './library-db'

export type HistoryEntry = LibrarySource & {
  lastPlayedAt: number
  playCount: number
}

export type FavoriteEntry = LibrarySource & {
  addedAt: number
}

export type Playlist = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type PlaylistItem = LibrarySource & {
  id: string
  playlistId: string
  position: number
  addedAt: number
}

export interface LibraryRepository {
  recordPlayback(source: LibrarySource, playedAt?: number): Promise<HistoryEntry>
  listHistory(): Promise<HistoryEntry[]>
  removeHistory(sourceKey: string): Promise<void>
  clearHistory(): Promise<void>
  addFavorite(source: LibrarySource, addedAt?: number): Promise<FavoriteEntry>
  removeFavorite(sourceKey: string): Promise<void>
  isFavorite(sourceKey: string): Promise<boolean>
  listFavorites(): Promise<FavoriteEntry[]>
  createPlaylist(name: string): Promise<Playlist>
  renamePlaylist(id: string, name: string): Promise<Playlist>
  deletePlaylist(id: string): Promise<void>
  listPlaylists(): Promise<Playlist[]>
  addPlaylistItem(playlistId: string, source: LibrarySource): Promise<PlaylistItem>
  removePlaylistItem(itemId: string): Promise<void>
  reorderPlaylistItems(
    playlistId: string,
    orderedItemIds: readonly string[],
  ): Promise<void>
  listPlaylistItems(playlistId: string): Promise<PlaylistItem[]>
}

export type CreateLibraryRepositoryOptions = {
  databaseName?: string
}

const HISTORY_LIMIT = 200

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error ?? new Error('IndexedDB isteği başarısız.'))
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB işlemi iptal edildi.'))
    transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB işlemi başarısız.'))
    transaction.oncomplete = () => resolve()
  })
}

function createId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizePlaylistName(name: string) {
  const normalized = name.trim()
  if (!normalized) throw new Error('Playlist adı boş olamaz.')
  if (normalized.length > 80) {
    throw new Error('Playlist adı en fazla 80 karakter olabilir.')
  }
  return normalized
}

async function withDatabase<T>(
  databaseName: string,
  operation: (database: IDBDatabase) => Promise<T>,
): Promise<T> {
  const database = await openLibraryDatabase({ name: databaseName })
  try {
    return await operation(database)
  } finally {
    database.close()
  }
}

class IndexedDbLibraryRepository implements LibraryRepository {
  constructor(private readonly databaseName: string) {}

  async recordPlayback(
    source: LibrarySource,
    playedAt = Date.now(),
  ): Promise<HistoryEntry> {
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('history', 'readwrite')
      const store = transaction.objectStore('history')
      const existing = (await requestValue(store.get(source.sourceKey))) as
        | HistoryEntry
        | undefined
      const entry: HistoryEntry = {
        ...source,
        lastPlayedAt: playedAt,
        playCount: (existing?.playCount ?? 0) + 1,
      }
      await requestValue(store.put(entry))

      const all = (await requestValue(store.getAll())) as HistoryEntry[]
      if (all.length > HISTORY_LIMIT) {
        const excess = all
          .sort((left, right) => left.lastPlayedAt - right.lastPlayedAt)
          .slice(0, all.length - HISTORY_LIMIT)
        for (const stale of excess) {
          await requestValue(store.delete(stale.sourceKey))
        }
      }

      await transactionDone(transaction)
      return entry
    })
  }

  async listHistory(): Promise<HistoryEntry[]> {
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('history', 'readonly')
      const entries = (await requestValue(
        transaction.objectStore('history').getAll(),
      )) as HistoryEntry[]
      await transactionDone(transaction)
      return entries.sort((left, right) => right.lastPlayedAt - left.lastPlayedAt)
    })
  }

  async removeHistory(sourceKey: string): Promise<void> {
    await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('history', 'readwrite')
      await requestValue(transaction.objectStore('history').delete(sourceKey))
      await transactionDone(transaction)
    })
  }

  async clearHistory(): Promise<void> {
    await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('history', 'readwrite')
      await requestValue(transaction.objectStore('history').clear())
      await transactionDone(transaction)
    })
  }

  async addFavorite(
    source: LibrarySource,
    addedAt = Date.now(),
  ): Promise<FavoriteEntry> {
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('favorites', 'readwrite')
      const store = transaction.objectStore('favorites')
      const existing = (await requestValue(store.get(source.sourceKey))) as
        | FavoriteEntry
        | undefined
      const entry: FavoriteEntry = {
        ...source,
        addedAt: existing?.addedAt ?? addedAt,
      }
      await requestValue(store.put(entry))
      await transactionDone(transaction)
      return entry
    })
  }

  async removeFavorite(sourceKey: string): Promise<void> {
    await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('favorites', 'readwrite')
      await requestValue(transaction.objectStore('favorites').delete(sourceKey))
      await transactionDone(transaction)
    })
  }

  async isFavorite(sourceKey: string): Promise<boolean> {
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('favorites', 'readonly')
      const key = await requestValue(
        transaction.objectStore('favorites').getKey(sourceKey),
      )
      await transactionDone(transaction)
      return key !== undefined
    })
  }

  async listFavorites(): Promise<FavoriteEntry[]> {
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('favorites', 'readonly')
      const entries = (await requestValue(
        transaction.objectStore('favorites').getAll(),
      )) as FavoriteEntry[]
      await transactionDone(transaction)
      return entries.sort((left, right) => right.addedAt - left.addedAt)
    })
  }

  async createPlaylist(name: string): Promise<Playlist> {
    const normalizedName = normalizePlaylistName(name)
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('playlists', 'readwrite')
      const now = Date.now()
      const playlist: Playlist = {
        id: createId(),
        name: normalizedName,
        createdAt: now,
        updatedAt: now,
      }
      await requestValue(transaction.objectStore('playlists').add(playlist))
      await transactionDone(transaction)
      return playlist
    })
  }

  async renamePlaylist(id: string, name: string): Promise<Playlist> {
    const normalizedName = normalizePlaylistName(name)
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('playlists', 'readwrite')
      const store = transaction.objectStore('playlists')
      const existing = (await requestValue(store.get(id))) as Playlist | undefined
      if (!existing) throw new Error('Playlist bulunamadı.')
      const playlist = {
        ...existing,
        name: normalizedName,
        updatedAt: Date.now(),
      }
      await requestValue(store.put(playlist))
      await transactionDone(transaction)
      return playlist
    })
  }

  async deletePlaylist(id: string): Promise<void> {
    await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction(
        ['playlists', 'playlistItems'],
        'readwrite',
      )
      const itemStore = transaction.objectStore('playlistItems')
      const items = (await requestValue(
        itemStore.index('playlistId').getAll(id),
      )) as PlaylistItem[]
      for (const item of items) await requestValue(itemStore.delete(item.id))
      await requestValue(transaction.objectStore('playlists').delete(id))
      await transactionDone(transaction)
    })
  }

  async listPlaylists(): Promise<Playlist[]> {
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('playlists', 'readonly')
      const playlists = (await requestValue(
        transaction.objectStore('playlists').getAll(),
      )) as Playlist[]
      await transactionDone(transaction)
      return playlists.sort((left, right) => right.updatedAt - left.updatedAt)
    })
  }

  async addPlaylistItem(
    playlistId: string,
    source: LibrarySource,
  ): Promise<PlaylistItem> {
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction(
        ['playlists', 'playlistItems'],
        'readwrite',
      )
      const playlistStore = transaction.objectStore('playlists')
      const playlist = (await requestValue(
        playlistStore.get(playlistId),
      )) as Playlist | undefined
      if (!playlist) throw new Error('Playlist bulunamadı.')

      const itemStore = transaction.objectStore('playlistItems')
      const existing = (await requestValue(
        itemStore.index('playlistSource').get([playlistId, source.sourceKey]),
      )) as PlaylistItem | undefined
      if (existing) {
        const updated = { ...existing, ...source, id: existing.id }
        await requestValue(itemStore.put(updated))
        await transactionDone(transaction)
        return updated
      }

      const items = (await requestValue(
        itemStore.index('playlistId').getAll(playlistId),
      )) as PlaylistItem[]
      const item: PlaylistItem = {
        ...source,
        id: createId(),
        playlistId,
        position: items.length,
        addedAt: Date.now(),
      }
      await requestValue(itemStore.add(item))
      await requestValue(
        playlistStore.put({ ...playlist, updatedAt: Date.now() }),
      )
      await transactionDone(transaction)
      return item
    })
  }

  async removePlaylistItem(itemId: string): Promise<void> {
    await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('playlistItems', 'readwrite')
      const store = transaction.objectStore('playlistItems')
      const item = (await requestValue(store.get(itemId))) as PlaylistItem | undefined
      if (!item) {
        await transactionDone(transaction)
        return
      }
      await requestValue(store.delete(itemId))
      const remaining = (await requestValue(
        store.index('playlistId').getAll(item.playlistId),
      )) as PlaylistItem[]
      remaining.sort((left, right) => left.position - right.position)
      for (const [position, remainingItem] of remaining.entries()) {
        if (remainingItem.position !== position) {
          await requestValue(store.put({ ...remainingItem, position }))
        }
      }
      await transactionDone(transaction)
    })
  }

  async reorderPlaylistItems(
    playlistId: string,
    orderedItemIds: readonly string[],
  ): Promise<void> {
    await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('playlistItems', 'readwrite')
      const store = transaction.objectStore('playlistItems')
      const items = (await requestValue(
        store.index('playlistId').getAll(playlistId),
      )) as PlaylistItem[]
      const currentIds = new Set(items.map(({ id }) => id))
      const requestedIds = new Set(orderedItemIds)
      if (
        currentIds.size !== requestedIds.size ||
        orderedItemIds.length !== items.length ||
        orderedItemIds.some((id) => !currentIds.has(id))
      ) {
        transaction.abort()
        throw new Error('Playlist sırası mevcut öğelerle eşleşmiyor.')
      }

      const byId = new Map(items.map((item) => [item.id, item]))
      for (const [position, id] of orderedItemIds.entries()) {
        const item = byId.get(id)!
        await requestValue(store.put({ ...item, position }))
      }
      await transactionDone(transaction)
    })
  }

  async listPlaylistItems(playlistId: string): Promise<PlaylistItem[]> {
    return await withDatabase(this.databaseName, async (database) => {
      const transaction = database.transaction('playlistItems', 'readonly')
      const items = (await requestValue(
        transaction.objectStore('playlistItems').index('playlistId').getAll(playlistId),
      )) as PlaylistItem[]
      await transactionDone(transaction)
      return items.sort((left, right) => left.position - right.position)
    })
  }
}

export async function createLibraryRepository(
  options: CreateLibraryRepositoryOptions = {},
): Promise<LibraryRepository> {
  const databaseName = options.databaseName ?? LIBRARY_DATABASE_NAME
  const database = await openLibraryDatabase({ name: databaseName })
  database.close()
  return new IndexedDbLibraryRepository(databaseName)
}

export { deleteLibraryDatabase }
