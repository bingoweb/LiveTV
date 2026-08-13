import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { LibraryContextValue } from '../library/library-context'
import type { PlaylistItem } from '../library/library-repository'
import { PlaylistsLibraryView } from './PlaylistsLibrary'

function library(
  overrides: Partial<LibraryContextValue> = {},
): LibraryContextValue {
  return {
    status: 'ready',
    history: [],
    favorites: [
      {
        sourceKey: 'video:https://example.com/favorite.mp4',
        url: 'https://example.com/favorite.mp4',
        kind: 'video',
        title: 'Favori Video',
        addedAt: 100,
      },
    ],
    playlists: [{ id: 'p1', name: 'Haberler', createdAt: 1, updatedAt: 2 }],
    recordPlayback: async () => {},
    toggleFavorite: async () => {},
    createPlaylist: async () => ({ id: 'p1', name: 'x', createdAt: 1, updatedAt: 1 }),
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

const items: PlaylistItem[] = [
  {
    id: 'i1',
    playlistId: 'p1',
    sourceKey: 'youtube:dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    kind: 'youtube',
    title: 'Haber Akışı',
    position: 0,
    addedAt: 1,
  },
]

describe('PlaylistsLibraryView', () => {
  it('renders favorites, playlist controls, and ordered items', () => {
    const markup = renderToStaticMarkup(
      <PlaylistsLibraryView
        library={library()}
        selectedPlaylistId="p1"
        items={items}
        newPlaylistName=""
        onNewPlaylistNameChange={() => {}}
        onCreatePlaylist={() => {}}
        onSelectPlaylist={() => {}}
        onRenamePlaylist={() => {}}
        onDeletePlaylist={() => {}}
        onPlaySource={() => {}}
        onRemoveItem={() => {}}
        onMoveItem={() => {}}
      />,
    )

    expect(markup).toContain('Favoriler')
    expect(markup).toContain('Favori Video')
    expect(markup).toContain('Yeni playlist')
    expect(markup).toContain('Haberler')
    expect(markup).toContain('Haber Akışı')
    expect(markup).toContain('Yukarı')
    expect(markup).toContain('Aşağı')
    expect(markup).toContain('Yeniden adlandır')
    expect(markup).toContain('Playlisti sil')
  })

  it('renders storage unavailable without library controls', () => {
    const markup = renderToStaticMarkup(
      <PlaylistsLibraryView
        library={library({ status: 'unavailable', favorites: [], playlists: [] })}
        selectedPlaylistId={null}
        items={[]}
        newPlaylistName=""
        onNewPlaylistNameChange={() => {}}
        onCreatePlaylist={() => {}}
        onSelectPlaylist={() => {}}
        onRenamePlaylist={() => {}}
        onDeletePlaylist={() => {}}
        onPlaySource={() => {}}
        onRemoveItem={() => {}}
        onMoveItem={() => {}}
      />,
    )

    expect(markup).toContain('Yerel kütüphane kullanılamıyor')
    expect(markup).not.toContain('Yeni playlist')
  })
})
