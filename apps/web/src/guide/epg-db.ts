export const EPG_DATABASE_NAME = 'livetv-epg'
export const EPG_DATABASE_VERSION = 1

export async function openEpgDatabase(
  name = EPG_DATABASE_NAME,
): Promise<IDBDatabase> {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, EPG_DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains('sources')) {
        const sources = database.createObjectStore('sources', {
          keyPath: 'sourceKey',
        })
        sources.createIndex('listId', 'listId', { unique: false })
        sources.createIndex('listPosition', ['listId', 'position'], {
          unique: false,
        })
      }

      if (!database.objectStoreNames.contains('channels')) {
        const channels = database.createObjectStore('channels', {
          keyPath: 'id',
        })
        channels.createIndex('sourceKey', 'sourceKey', { unique: false })
        channels.createIndex('xmltvId', 'xmltvId', { unique: false })
      }

      if (!database.objectStoreNames.contains('programmes')) {
        const programmes = database.createObjectStore('programmes', {
          keyPath: 'id',
        })
        programmes.createIndex('sourceKey', 'sourceKey', { unique: false })
        programmes.createIndex('xmltvChannelId', 'xmltvChannelId', {
          unique: false,
        })
        programmes.createIndex('startAt', 'startAt', { unique: false })
        programmes.createIndex(
          'sourceChannelStart',
          ['sourceKey', 'xmltvChannelId', 'startAt'],
          { unique: false },
        )
      }
    }

    request.onerror = () =>
      reject(request.error ?? new Error('EPG IndexedDB açılamadı.'))
    request.onblocked = () =>
      reject(new Error('EPG IndexedDB yükseltmesi engellendi.'))
    request.onsuccess = () => resolve(request.result)
  })
}

export async function deleteEpgDatabase(name = EPG_DATABASE_NAME) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onerror = () =>
      reject(request.error ?? new Error('EPG IndexedDB silinemedi.'))
    request.onblocked = () =>
      reject(new Error('EPG IndexedDB silme işlemi engellendi.'))
    request.onsuccess = () => resolve()
  })
}
