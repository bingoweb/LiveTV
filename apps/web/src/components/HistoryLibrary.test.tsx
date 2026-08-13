import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { LibraryContextValue } from '../library/library-context'
import { HistoryLibraryView } from './HistoryLibrary'

function library(
  overrides: Partial<LibraryContextValue> = {},
): LibraryContextValue {
  return {
    status: 'ready',
    history: [
      {
        sourceKey: 'youtube:dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        kind: 'youtube',
        title: 'Canlı Haber',
        lastPlayedAt: 200,
        playCount: 2,
      },
    ],
    favorites: [],
    playlists: [],
    recordPlayback: async () => {},
    toggleFavorite: async () => {},
    createPlaylist: async () => ({
      id: 'p1',
      name: 'x',
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

describe('HistoryLibraryView', () => {
  it('renders persistent history actions and favorite state', () => {
    const markup = renderToStaticMarkup(
      <HistoryLibraryView
        library={library({
          favorites: [
            {
              sourceKey: 'youtube:dQw4w9WgXcQ',
              url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
              kind: 'youtube',
              title: 'Canlı Haber',
              addedAt: 100,
            },
          ],
        })}
        onPlaySource={() => {}}
      />,
    )

    expect(markup).toContain('İzleme geçmişi')
    expect(markup).toContain('Canlı Haber')
    expect(markup).toContain('2 kez oynatıldı')
    expect(markup).toContain('Tekrar oynat')
    expect(markup).toContain('Favoriden çıkar')
    expect(markup).toContain('Kaydı sil')
    expect(markup).toContain('Geçmişi temizle')
  })

  it('renders storage unavailable without crashing', () => {
    const markup = renderToStaticMarkup(
      <HistoryLibraryView
        library={library({ status: 'unavailable', history: [] })}
        onPlaySource={() => {}}
      />,
    )

    expect(markup).toContain('Yerel kütüphane kullanılamıyor')
  })
})
