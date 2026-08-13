import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  LibraryProvider,
  createLibraryController,
  useLibrary,
} from './library-context'
import type {
  FavoriteEntry,
  HistoryEntry,
  LibraryRepository,
  Playlist,
  PlaylistItem,
} from './library-repository'
import type { LibrarySource } from './library-types'

function makeSource(id: number): LibrarySource {
  return {
    sourceKey: `video:https://example.com/${id}.mp4`,
    url: `https://example.com/${id}.mp4`,
    kind: 'video',
    title: `Video ${id}`,
  }
}

class MemoryRepository implements LibraryRepository {
  history: HistoryEntry[] = []
  favorites: FavoriteEntry[] = []
  playlists: Playlist[] = []
  items: PlaylistItem[] = []

  async recordPlayback(source: LibrarySource): Promise<HistoryEntry> {
    const entry = { ...source, lastPlayedAt: 100, playCount: 1 }
    this.history = [entry]
    return entry
  }

  async listHistory() {
    return [...this.history]
  }

  async removeHistory(sourceKey: string) {
    this.history = this.history.filter((entry) => entry.sourceKey !== sourceKey)
  }

  async clearHistory() {
    this.history = []
  }

  async addFavorite(source: LibrarySource): Promise<FavoriteEntry> {
    const entry = { ...source, addedAt: 100 }
    this.favorites = [entry]
    return entry
  }

  async removeFavorite(sourceKey: string) {
    this.favorites = this.favorites.filter(
      (entry) => entry.sourceKey !== sourceKey,
    )
  }

  async isFavorite(sourceKey: string) {
    return this.favorites.some((entry) => entry.sourceKey === sourceKey)
  }

  async listFavorites() {
    return [...this.favorites]
  }

  async createPlaylist(name: string): Promise<Playlist> {
    const playlist = { id: `p${this.playlists.length + 1}`, name, createdAt: 1, updatedAt: 1 }
    this.playlists = [...this.playlists, playlist]
    return playlist
  }

  async renamePlaylist(id: string, name: string): Promise<Playlist> {
    const playlist = this.playlists.find((item) => item.id === id)
    if (!playlist) throw new Error('Playlist bulunamadı.')
    const renamed = { ...playlist, name, updatedAt: playlist.updatedAt + 1 }
    this.playlists = this.playlists.map((item) => (item.id === id ? renamed : item))
    return renamed
  }

  async deletePlaylist(id: string) {
    this.playlists = this.playlists.filter((playlist) => playlist.id !== id)
    this.items = this.items.filter((item) => item.playlistId !== id)
  }

  async listPlaylists() {
    return [...this.playlists]
  }

  async addPlaylistItem(playlistId: string, source: LibrarySource): Promise<PlaylistItem> {
    const item = { ...source, id: `i${this.items.length + 1}`, playlistId, position: this.items.length, addedAt: 1 }
    this.items = [...this.items, item]
    return item
  }

  async removePlaylistItem(itemId: string) {
    this.items = this.items.filter((item) => item.id !== itemId)
  }

  async reorderPlaylistItems(playlistId: string, orderedItemIds: readonly string[]) {
    this.items = this.items.map((item) => {
      if (item.playlistId !== playlistId) return item
      return { ...item, position: orderedItemIds.indexOf(item.id) }
    })
  }

  async listPlaylistItems(playlistId: string) {
    return this.items
      .filter((item) => item.playlistId === playlistId)
      .sort((left, right) => left.position - right.position)
  }
}

describe('library controller', () => {
  it('loads repository state and refreshes after mutations', async () => {
    const repository = new MemoryRepository()
    repository.history = [{ ...makeSource(1), lastPlayedAt: 1, playCount: 1 }]
    const controller = createLibraryController(async () => repository)

    await controller.initialize()
    expect(controller.getSnapshot().status).toBe('ready')
    expect(controller.getSnapshot().history).toHaveLength(1)

    await controller.recordPlayback(makeSource(2))
    expect(controller.getSnapshot().history[0]?.sourceKey).toBe(
      makeSource(2).sourceKey,
    )

    await controller.toggleFavorite(makeSource(2))
    expect(controller.getSnapshot().favorites[0]?.sourceKey).toBe(
      makeSource(2).sourceKey,
    )
  })

  it('moves to unavailable when repository initialization fails', async () => {
    const controller = createLibraryController(async () => {
      throw new Error('blocked')
    })

    await controller.initialize()

    expect(controller.getSnapshot().status).toBe('unavailable')
    expect(controller.getSnapshot().history).toEqual([])
  })
})

function StatusProbe() {
  const library = useLibrary()
  return <span>{library.status}</span>
}

describe('LibraryProvider', () => {
  it('renders a safe loading snapshot before browser initialization', () => {
    const markup = renderToStaticMarkup(
      <LibraryProvider repositoryFactory={async () => new MemoryRepository()}>
        <StatusProbe />
      </LibraryProvider>,
    )

    expect(markup).toContain('loading')
  })
})
