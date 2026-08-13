export const LIBRARY_DATABASE_NAME = 'livetv-library'
export const LIBRARY_DATABASE_VERSION = 1

export type OpenLibraryDatabaseOptions = {
  name?: string
}

export async function openLibraryDatabase(
  options: OpenLibraryDatabaseOptions = {},
): Promise<IDBDatabase> {
  const name = options.name ?? LIBRARY_DATABASE_NAME

  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, LIBRARY_DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains('history')) {
        const history = database.createObjectStore('history', {
          keyPath: 'sourceKey',
        })
        history.createIndex('lastPlayedAt', 'lastPlayedAt')
      }

      if (!database.objectStoreNames.contains('favorites')) {
        const favorites = database.createObjectStore('favorites', {
          keyPath: 'sourceKey',
        })
        favorites.createIndex('addedAt', 'addedAt')
      }

      if (!database.objectStoreNames.contains('playlists')) {
        const playlists = database.createObjectStore('playlists', {
          keyPath: 'id',
        })
        playlists.createIndex('updatedAt', 'updatedAt')
      }

      if (!database.objectStoreNames.contains('playlistItems')) {
        const items = database.createObjectStore('playlistItems', {
          keyPath: 'id',
        })
        items.createIndex('playlistId', 'playlistId')
        items.createIndex('playlistPosition', ['playlistId', 'position'])
        items.createIndex('playlistSource', ['playlistId', 'sourceKey'], {
          unique: true,
        })
      }
    }

    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB açılamadı.'))
    request.onblocked = () =>
      reject(new Error('IndexedDB yükseltmesi engellendi.'))
    request.onsuccess = () => resolve(request.result)
  })
}

export async function deleteLibraryDatabase(name: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onerror = () =>
      reject(request.error ?? new Error('IndexedDB silinemedi.'))
    request.onblocked = () =>
      reject(new Error('IndexedDB silme işlemi engellendi.'))
    request.onsuccess = () => resolve()
  })
}
