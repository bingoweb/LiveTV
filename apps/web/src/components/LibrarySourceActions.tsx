import { useEffect, useState } from 'react'

import type { LibraryContextValue } from '../library/library-context'
import { useLibrary } from '../library/library-context'
import type { LibrarySource } from '../library/library-types'

export type LibrarySourceActionsViewProps = {
  library: LibraryContextValue
  source: LibrarySource | null
  selectedPlaylistId: string
  newPlaylistName: string
  errorMessage?: string | null
  onSelectPlaylist: (id: string) => void
  onNewPlaylistNameChange: (name: string) => void
  onToggleFavorite: () => void
  onAddToPlaylist: () => void
  onCreateAndAdd: () => void
}

export function LibrarySourceActionsView({
  library,
  source,
  selectedPlaylistId,
  newPlaylistName,
  errorMessage,
  onSelectPlaylist,
  onNewPlaylistNameChange,
  onToggleFavorite,
  onAddToPlaylist,
  onCreateAndAdd,
}: LibrarySourceActionsViewProps) {
  const disabled = !source || library.status !== 'ready'
  const favorite = source
    ? library.favorites.some(({ sourceKey }) => sourceKey === source.sourceKey)
    : false

  return (
    <div
      className="library-source-actions"
      aria-label="Kaynağı kütüphaneye ekle"
    >
      <button type="button" disabled={disabled} onClick={onToggleFavorite}>
        {favorite ? 'Favoriden çıkar' : 'Favoriye ekle'}
      </button>

      {library.playlists.length > 0 ? (
        <div className="library-source-playlist-row">
          <select
            name="library-source-playlist"
            aria-label="Playlist seç"
            disabled={disabled}
            value={selectedPlaylistId}
            onChange={(event) => onSelectPlaylist(event.target.value)}
          >
            {library.playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={disabled || !selectedPlaylistId}
            onClick={onAddToPlaylist}
          >
            Listeye ekle
          </button>
        </div>
      ) : null}

      <div className="library-source-create-row">
        <input
          name="library-source-new-playlist"
          aria-label="Yeni playlist"
          maxLength={80}
          value={newPlaylistName}
          placeholder="Yeni playlist"
          disabled={disabled}
          onChange={(event) => onNewPlaylistNameChange(event.target.value)}
        />
        <button
          type="button"
          disabled={disabled || !newPlaylistName.trim()}
          onClick={onCreateAndAdd}
        >
          Oluştur ve ekle
        </button>
      </div>

      {library.status === 'unavailable' ? (
        <small className="library-action-status">
          Kütüphane kullanılamıyor
        </small>
      ) : errorMessage ? (
        <small className="library-action-status" role="alert">
          {errorMessage}
        </small>
      ) : null}
    </div>
  )
}

type LibrarySourceActionsProps = {
  source: LibrarySource | null
}

export function LibrarySourceActions({ source }: LibrarySourceActionsProps) {
  const library = useLibrary()
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(
    library.playlists[0]?.id ?? '',
  )
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    if (
      selectedPlaylistId &&
      library.playlists.some(({ id }) => id === selectedPlaylistId)
    ) {
      return
    }
    setSelectedPlaylistId(library.playlists[0]?.id ?? '')
  }, [library.playlists, selectedPlaylistId])

  const run = async (operation: () => Promise<void>) => {
    setErrorMessage(null)
    try {
      await operation()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Kütüphane işlemi başarısız.',
      )
    }
  }

  const toggleFavorite = () => {
    if (!source) return
    void run(() => library.toggleFavorite(source))
  }

  const addToPlaylist = () => {
    if (!source || !selectedPlaylistId) return
    void run(() => library.addToPlaylist(selectedPlaylistId, source))
  }

  const createAndAdd = () => {
    if (!source || !newPlaylistName.trim()) return
    void run(async () => {
      const playlist = await library.createPlaylist(newPlaylistName)
      await library.addToPlaylist(playlist.id, source)
      setSelectedPlaylistId(playlist.id)
      setNewPlaylistName('')
    })
  }

  return (
    <LibrarySourceActionsView
      library={library}
      source={source}
      selectedPlaylistId={selectedPlaylistId}
      newPlaylistName={newPlaylistName}
      errorMessage={errorMessage}
      onSelectPlaylist={setSelectedPlaylistId}
      onNewPlaylistNameChange={setNewPlaylistName}
      onToggleFavorite={toggleFavorite}
      onAddToPlaylist={addToPlaylist}
      onCreateAndAdd={createAndAdd}
    />
  )
}
