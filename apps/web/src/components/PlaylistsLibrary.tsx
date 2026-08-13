import { type FormEvent, useEffect, useState } from 'react'

import type { LibraryContextValue } from '../library/library-context'
import { useLibrary } from '../library/library-context'
import type { PlaylistItem } from '../library/library-repository'
import type { LibrarySource } from '../library/library-types'
import { AppIcon } from './AppIcon'

type MoveDirection = 'up' | 'down'

export type PlaylistsLibraryViewProps = {
  library: LibraryContextValue
  selectedPlaylistId: string | null
  items: readonly PlaylistItem[]
  newPlaylistName: string
  onNewPlaylistNameChange: (name: string) => void
  onCreatePlaylist: (event: FormEvent<HTMLFormElement>) => void
  onSelectPlaylist: (id: string) => void
  onRenamePlaylist: (id: string) => void
  onDeletePlaylist: (id: string) => void
  onPlaySource: (source: LibrarySource) => void
  onRemoveItem: (itemId: string) => void
  onMoveItem: (itemId: string, direction: MoveDirection) => void
}

export function PlaylistsLibraryView({
  library,
  selectedPlaylistId,
  items,
  newPlaylistName,
  onNewPlaylistNameChange,
  onCreatePlaylist,
  onSelectPlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onPlaySource,
  onRemoveItem,
  onMoveItem,
}: PlaylistsLibraryViewProps) {
  if (library.status === 'unavailable') {
    return (
      <aside className="context-panel local-library-panel" aria-label="Playlistler">
        <div className="library-unavailable" role="status">
          <strong>Yerel kütüphane kullanılamıyor</strong>
          <p>Favoriler ve playlistler bu tarayıcı oturumunda kaydedilemiyor.</p>
        </div>
      </aside>
    )
  }

  if (library.status === 'loading') {
    return (
      <aside className="context-panel local-library-panel" aria-label="Playlistler">
        <div className="library-unavailable" role="status">
          <strong>Kütüphane yükleniyor…</strong>
        </div>
      </aside>
    )
  }

  const selectedPlaylist = library.playlists.find(
    ({ id }) => id === selectedPlaylistId,
  )

  return (
    <aside className="context-panel local-library-panel" aria-label="Playlistler">
      <div className="context-heading local-library-heading">
        <span className="eyebrow">Yerel kütüphane</span>
        <h2>Favoriler ve playlistler</h2>
        <p>Kaynaklarını cihazında sakla ve karışık listelerde sırala.</p>
      </div>

      <section className="library-stack">
        <div className="library-section-title">
          <strong>Favoriler</strong>
          <span>{library.favorites.length}</span>
        </div>
        {library.favorites.length === 0 ? (
          <div className="empty-library">
            <span className="empty-library-icon">
              <AppIcon name="playlists" size={21} />
            </span>
            <p>Henüz favoriye eklenmiş kaynak yok.</p>
          </div>
        ) : (
          <div className="library-entry-list">
            {library.favorites.map((favorite) => (
              <article className="library-entry library-entry--compact" key={favorite.sourceKey}>
                <div className="library-entry-copy">
                  <strong>{favorite.title}</strong>
                  <small>{favorite.kind.toUpperCase()}</small>
                </div>
                <div className="library-entry-actions">
                  <button type="button" onClick={() => onPlaySource(favorite)}>
                    Oynat
                  </button>
                  <button
                    type="button"
                    onClick={() => void library.toggleFavorite(favorite)}
                  >
                    Favoriden çıkar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="library-stack">
        <div className="library-section-title">
          <strong>Playlistler</strong>
          <span>{library.playlists.length}</span>
        </div>

        <form className="playlist-create-form" onSubmit={onCreatePlaylist}>
          <label htmlFor="new-playlist-name">Yeni playlist</label>
          <div>
            <input
              id="new-playlist-name"
              value={newPlaylistName}
              maxLength={80}
              placeholder="Örn. Haber kanalları"
              onChange={(event) => onNewPlaylistNameChange(event.target.value)}
            />
            <button type="submit" disabled={!newPlaylistName.trim()}>
              Oluştur
            </button>
          </div>
        </form>

        {library.playlists.length > 0 ? (
          <div className="playlist-selector" aria-label="Playlist seç">
            {library.playlists.map((playlist) => (
              <div className="playlist-selector-row" key={playlist.id}>
                <button
                  type="button"
                  className={playlist.id === selectedPlaylistId ? 'is-active' : ''}
                  onClick={() => onSelectPlaylist(playlist.id)}
                >
                  {playlist.name}
                </button>
                <button type="button" onClick={() => onRenamePlaylist(playlist.id)}>
                  Yeniden adlandır
                </button>
                <button type="button" onClick={() => onDeletePlaylist(playlist.id)}>
                  Playlisti sil
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="library-muted-copy">İlk playlistini oluştur.</p>
        )}
      </section>

      {selectedPlaylist ? (
        <section className="library-stack">
          <div className="library-section-title">
            <strong>{selectedPlaylist.name}</strong>
            <span>{items.length} öğe</span>
          </div>
          {items.length === 0 ? (
            <p className="library-muted-copy">Bu playlist henüz boş.</p>
          ) : (
            <div className="library-entry-list">
              {items.map((item, index) => (
                <article className="library-entry" key={item.id}>
                  <div className="library-entry-copy">
                    <small>#{index + 1}</small>
                    <strong>{item.title}</strong>
                  </div>
                  <div className="library-entry-actions">
                    <button type="button" onClick={() => onPlaySource(item)}>
                      Oynat
                    </button>
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => onMoveItem(item.id, 'up')}
                    >
                      Yukarı
                    </button>
                    <button
                      type="button"
                      disabled={index === items.length - 1}
                      onClick={() => onMoveItem(item.id, 'down')}
                    >
                      Aşağı
                    </button>
                    <button type="button" onClick={() => onRemoveItem(item.id)}>
                      Listeden çıkar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </aside>
  )
}

type PlaylistsLibraryProps = {
  onPlaySource: (source: LibrarySource) => void
}

export function PlaylistsLibrary({ onPlaySource }: PlaylistsLibraryProps) {
  const library = useLibrary()
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(
    library.playlists[0]?.id ?? null,
  )
  const [items, setItems] = useState<PlaylistItem[]>([])
  const [newPlaylistName, setNewPlaylistName] = useState('')

  const refreshItems = async (playlistId: string | null) => {
    if (!playlistId || library.status !== 'ready') {
      setItems([])
      return
    }
    setItems(await library.listPlaylistItems(playlistId))
  }

  useEffect(() => {
    if (library.status !== 'ready') return
    if (
      selectedPlaylistId &&
      library.playlists.some(({ id }) => id === selectedPlaylistId)
    ) {
      void refreshItems(selectedPlaylistId)
      return
    }

    const nextId = library.playlists[0]?.id ?? null
    setSelectedPlaylistId(nextId)
    void refreshItems(nextId)
  }, [library.playlists, library.status, selectedPlaylistId])

  const createPlaylist = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const playlist = await library.createPlaylist(newPlaylistName)
    setNewPlaylistName('')
    setSelectedPlaylistId(playlist.id)
    setItems([])
  }

  const renamePlaylist = async (id: string) => {
    if (typeof window === 'undefined') return
    const current = library.playlists.find((playlist) => playlist.id === id)
    if (!current) return
    const name = window.prompt('Yeni playlist adı', current.name)
    if (name === null) return
    await library.renamePlaylist(id, name)
  }

  const deletePlaylist = async (id: string) => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Bu playlist silinsin mi?')
    ) {
      return
    }
    await library.deletePlaylist(id)
    if (selectedPlaylistId === id) {
      setSelectedPlaylistId(null)
      setItems([])
    }
  }

  const removeItem = async (itemId: string) => {
    await library.removePlaylistItem(itemId)
    await refreshItems(selectedPlaylistId)
  }

  const moveItem = async (itemId: string, direction: MoveDirection) => {
    if (!selectedPlaylistId) return
    const index = items.findIndex(({ id }) => id === itemId)
    const target = direction === 'up' ? index - 1 : index + 1
    if (index < 0 || target < 0 || target >= items.length) return

    const orderedIds = items.map(({ id }) => id)
    const [moved] = orderedIds.splice(index, 1)
    if (!moved) return
    orderedIds.splice(target, 0, moved)
    await library.reorderPlaylistItems(selectedPlaylistId, orderedIds)
    await refreshItems(selectedPlaylistId)
  }

  return (
    <PlaylistsLibraryView
      library={library}
      selectedPlaylistId={selectedPlaylistId}
      items={items}
      newPlaylistName={newPlaylistName}
      onNewPlaylistNameChange={setNewPlaylistName}
      onCreatePlaylist={(event) => void createPlaylist(event)}
      onSelectPlaylist={(id) => {
        setSelectedPlaylistId(id)
        void refreshItems(id)
      }}
      onRenamePlaylist={(id) => void renamePlaylist(id)}
      onDeletePlaylist={(id) => void deletePlaylist(id)}
      onPlaySource={onPlaySource}
      onRemoveItem={(id) => void removeItem(id)}
      onMoveItem={(id, direction) => void moveItem(id, direction)}
    />
  )
}
