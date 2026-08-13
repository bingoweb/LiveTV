import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LibrarySource } from './library-types'
import {
  createLibraryRepository,
  deleteLibraryDatabase,
  type LibraryRepository,
} from './library-repository'

const databaseName = 'livetv-library-test'

function source(index: number): LibrarySource {
  return {
    sourceKey: `video:https://example.com/${index}.mp4`,
    url: `https://example.com/${index}.mp4`,
    kind: 'video',
    title: `Video ${index}`,
  }
}

describe('IndexedDB library repository', () => {
  let repository: LibraryRepository

  beforeEach(async () => {
    repository = await createLibraryRepository({ databaseName })
  })

  afterEach(async () => {
    await deleteLibraryDatabase(databaseName)
  })

  it('updates one history row and increments play count on replay', async () => {
    await repository.recordPlayback(source(1), 100)
    await repository.recordPlayback(
      { ...source(1), title: 'Updated title' },
      200,
    )

    expect(await repository.listHistory()).toEqual([
      {
        ...source(1),
        title: 'Updated title',
        lastPlayedAt: 200,
        playCount: 2,
      },
    ])
  })

  it('retains only the newest 200 history rows', async () => {
    for (let index = 0; index < 201; index += 1) {
      await repository.recordPlayback(source(index), index)
    }

    const history = await repository.listHistory()
    expect(history).toHaveLength(200)
    expect(history[0]?.sourceKey).toBe(source(200).sourceKey)
    expect(history.at(-1)?.sourceKey).toBe(source(1).sourceKey)
  })

  it('adds favorites idempotently and preserves the original addedAt', async () => {
    await repository.addFavorite(source(1), 100)
    await repository.addFavorite({ ...source(1), title: 'Fresh title' }, 200)

    expect(await repository.listFavorites()).toEqual([
      { ...source(1), title: 'Fresh title', addedAt: 100 },
    ])
    expect(await repository.isFavorite(source(1).sourceKey)).toBe(true)
  })

  it('validates playlist names', async () => {
    await expect(repository.createPlaylist('   ')).rejects.toThrow(
      'Playlist adı boş olamaz.',
    )
    await expect(repository.createPlaylist('x'.repeat(81))).rejects.toThrow(
      'Playlist adı en fazla 80 karakter olabilir.',
    )
  })

  it('prevents duplicate playlist items and keeps contiguous reorder positions', async () => {
    const playlist = await repository.createPlaylist('Haber')
    const first = await repository.addPlaylistItem(playlist.id, source(1))
    const duplicate = await repository.addPlaylistItem(playlist.id, source(1))
    const second = await repository.addPlaylistItem(playlist.id, source(2))

    expect(duplicate.id).toBe(first.id)
    expect(await repository.listPlaylistItems(playlist.id)).toHaveLength(2)

    await repository.reorderPlaylistItems(playlist.id, [second.id, first.id])

    expect(
      (await repository.listPlaylistItems(playlist.id)).map(
        ({ id, position }) => [id, position],
      ),
    ).toEqual([
      [second.id, 0],
      [first.id, 1],
    ])
  })

  it('deletes playlist items with the playlist', async () => {
    const playlist = await repository.createPlaylist('Silinecek')
    await repository.addPlaylistItem(playlist.id, source(1))

    await repository.deletePlaylist(playlist.id)

    expect(await repository.listPlaylists()).toEqual([])
    expect(await repository.listPlaylistItems(playlist.id)).toEqual([])
  })

  it('clears history without touching favorites or playlists', async () => {
    await repository.recordPlayback(source(1), 100)
    await repository.addFavorite(source(1), 100)
    await repository.createPlaylist('Korunacak')

    await repository.clearHistory()

    expect(await repository.listHistory()).toEqual([])
    expect(await repository.listFavorites()).toHaveLength(1)
    expect(await repository.listPlaylists()).toHaveLength(1)
  })
})
