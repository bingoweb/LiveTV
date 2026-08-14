export const IPTV_DATABASE_NAME = 'livetv-iptv'
export const IPTV_DATABASE_VERSION = 1

export async function openIptvDatabase(
  name = IPTV_DATABASE_NAME,
): Promise<IDBDatabase> {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, IPTV_DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      if (!database.objectStoreNames.contains('lists')) {
        database.createObjectStore('lists', { keyPath: 'id' })
      }

      if (!database.objectStoreNames.contains('channels')) {
        const channels = database.createObjectStore('channels', {
          keyPath: 'id',
        })
        channels.createIndex('listId', 'listId', { unique: false })
        channels.createIndex('listGroup', ['listId', 'groupTitle'], {
          unique: false,
        })
        channels.createIndex('listPosition', ['listId', 'position'], {
          unique: false,
        })
      }
    }

    request.onerror = () =>
      reject(request.error ?? new Error('IPTV IndexedDB açılamadı.'))
    request.onblocked = () =>
      reject(new Error('IPTV IndexedDB yükseltmesi engellendi.'))
    request.onsuccess = () => resolve(request.result)
  })
}

export async function deleteIptvDatabase(name = IPTV_DATABASE_NAME) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onerror = () =>
      reject(request.error ?? new Error('IPTV IndexedDB silinemedi.'))
    request.onblocked = () =>
      reject(new Error('IPTV IndexedDB silme işlemi engellendi.'))
    request.onsuccess = () => resolve()
  })
}
