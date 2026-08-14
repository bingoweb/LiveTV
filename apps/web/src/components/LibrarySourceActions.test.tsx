import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { LibraryContextValue } from '../library/library-context'
import type { LibrarySource } from '../library/library-types'
import { LibrarySourceActionsView } from './LibrarySourceActions'

const source: LibrarySource = {
  sourceKey: 'youtube:dQw4w9WgXcQ',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  kind: 'youtube',
  title: 'Canlı Haber',
}

function library(
  overrides: Partial<LibraryContextValue> = {},
): LibraryContextValue {
  return {
    status: 'ready',
    history: [],
    favorites: [],
    playlists: [{ id: 'p1', name: 'Haberler', createdAt: 1, updatedAt: 2 }],
    recordPlayback: async () => {},
    toggleFavorite: async () => {},
    createPlaylist: async () => ({
      id: 'p2',
      name: 'Yeni',
      createdAt: 1,
      updatedAt: 1,
    }),
    renamePlaylist: async () => {},
    deletePlaylist: async () => {},
    addToPlaylist: async () => {},
    removePlaylistItem: async () => {},
    reorderPlaylistItems: async () => {},
    listPlaylistItems: async () => [],
    removeHistory: async () => {},
    clearHistory: async () => {},
    ...overrides,
  }
}

describe('LibrarySourceActionsView', () => {
  it('renders favorite, existing playlist, and create-and-add actions', () => {
    const markup = renderToStaticMarkup(
      <LibrarySourceActionsView
        library={library()}
        source={source}
        selectedPlaylistId="p1"
        newPlaylistName=""
        onSelectPlaylist={() => {}}
        onNewPlaylistNameChange={() => {}}
        onToggleFavorite={() => {}}
        onAddToPlaylist={() => {}}
        onCreateAndAdd={() => {}}
      />,
    )

    expect(markup).toContain('Favoriye ekle')
    expect(markup).toContain('Haberler')
    expect(markup).toContain('Listeye ekle')
    expect(markup).toContain('Yeni playlist')
    expect(markup).toContain('Oluştur ve ekle')
    expect(markup).toContain('name="library-source-playlist"')
    expect(markup).toContain('name="library-source-new-playlist"')
  })

  it('shows favorite removal and disables persistence when unavailable', () => {
    const favoriteMarkup = renderToStaticMarkup(
      <LibrarySourceActionsView
        library={library({ favorites: [{ ...source, addedAt: 1 }] })}
        source={source}
        selectedPlaylistId="p1"
        newPlaylistName=""
        onSelectPlaylist={() => {}}
        onNewPlaylistNameChange={() => {}}
        onToggleFavorite={() => {}}
        onAddToPlaylist={() => {}}
        onCreateAndAdd={() => {}}
      />,
    )
    expect(favoriteMarkup).toContain('Favoriden çıkar')

    const unavailableMarkup = renderToStaticMarkup(
      <LibrarySourceActionsView
        library={library({ status: 'unavailable' })}
        source={source}
        selectedPlaylistId="p1"
        newPlaylistName=""
        onSelectPlaylist={() => {}}
        onNewPlaylistNameChange={() => {}}
        onToggleFavorite={() => {}}
        onAddToPlaylist={() => {}}
        onCreateAndAdd={() => {}}
      />,
    )
    expect(unavailableMarkup).toContain('Kütüphane kullanılamıyor')
    expect(unavailableMarkup).toContain('disabled=""')
  })
})
