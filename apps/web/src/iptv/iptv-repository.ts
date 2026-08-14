import { openIptvDatabase, IPTV_DATABASE_NAME } from './iptv-db'
import type { ParsedIptvChannel } from './m3u-types'

export type IptvListSourceType = 'url' | 'file' | 'paste'

export type IptvList = {
  id: string
  name: string
  sourceType: IptvListSourceType
  sourceUrl?: string
  epgUrls: string[]
  importedAt: number
  updatedAt: number
  channelCount: number
}

export type IptvChannel = ParsedIptvChannel & {
  id: string
  listId: string
  position: number
  searchText: string
}

export type ImportIptvListInput = {
  name: string
  sourceType: IptvListSourceType
  sourceUrl?: string
  epgUrls: string[]
  channels: ParsedIptvChannel[]
  importedAt?: number
}

export interface IptvRepository {
  importList(input: ImportIptvListInput): Promise<IptvList>
  replaceList(id: string, input: ImportIptvListInput): Promise<IptvList>
  listLists(): Promise<IptvList[]>
  getList(id: string): Promise<IptvList | null>
  deleteList(id: string): Promise<void>
  listChannels(listId: string): Promise<IptvChannel[]>
}

type CreateIptvRepositoryOptions = {
  databaseName?: string
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () =>
      reject(request.error ?? new Error('IPTV IndexedDB isteği başarısız.'))
    request.onsuccess = () => resolve(request.result)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () =>
      reject(
        transaction.error ?? new Error('IPTV IndexedDB işlemi iptal edildi.'),
      )
    transaction.onerror = () => {
      // onabort/oncomplete decides transaction outcome.
    }
    transaction.oncomplete = () => resolve()
  })
}

function createId() {
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.randomUUID === 'function'
  ) {
    return crypto.randomUUID()
  }
  return `iptv-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeName(name: string) {
  const normalized = name.trim()
  if (!normalized) throw new Error('IPTV liste adı boş olamaz.')
  return normalized
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isHttpUrl(value: unknown) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isIptvList(value: unknown): value is IptvList {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.sourceType === 'url' ||
      value.sourceType === 'file' ||
      value.sourceType === 'paste') &&
    (value.sourceUrl === undefined || typeof value.sourceUrl === 'string') &&
    isStringArray(value.epgUrls) &&
    typeof value.importedAt === 'number' &&
    Number.isFinite(value.importedAt) &&
    typeof value.updatedAt === 'number' &&
    Number.isFinite(value.updatedAt) &&
    typeof value.channelCount === 'number' &&
    Number.isInteger(value.channelCount) &&
    value.channelCount >= 0
  )
}

function optionalString(record: Record<string, unknown>, key: string) {
  return record[key] === undefined || typeof record[key] === 'string'
}

function isIptvChannel(value: unknown): value is IptvChannel {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.listId === 'string' &&
    typeof value.name === 'string' &&
    isHttpUrl(value.streamUrl) &&
    optionalString(value, 'tvgId') &&
    optionalString(value, 'tvgName') &&
    optionalString(value, 'logoUrl') &&
    optionalString(value, 'groupTitle') &&
    typeof value.position === 'number' &&
    Number.isInteger(value.position) &&
    value.position >= 0 &&
    typeof value.searchText === 'string'
  )
}

function buildSearchText(channel: ParsedIptvChannel) {
  let host = ''
  try {
    host = new URL(channel.streamUrl).host
  } catch {
    // Import validation happens before persistence; keep this defensive.
  }
  return [
    channel.name,
    channel.tvgName,
    channel.tvgId,
    channel.groupTitle,
    host,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr-TR')
}

function channelId(listId: string, channel: ParsedIptvChannel) {
  return JSON.stringify([listId, channel.tvgId ?? '', channel.streamUrl])
}

function storedChannel(
  listId: string,
  channel: ParsedIptvChannel,
  position: number,
): IptvChannel {
  return {
    ...channel,
    id: channelId(listId, channel),
    listId,
    position,
    searchText: buildSearchText(channel),
  }
}

async function deleteChannelsInTransaction(
  transaction: IDBTransaction,
  listId: string,
) {
  const store = transaction.objectStore('channels')
  const keys = await requestValue(
    store.index('listId').getAllKeys(IDBKeyRange.only(listId)),
  )
  for (const key of keys) {
    await requestValue(store.delete(key))
  }
}

class BrowserIptvRepository implements IptvRepository {
  constructor(private readonly databaseName: string) {}

  private async withDatabase<T>(operation: (db: IDBDatabase) => Promise<T>) {
    const database = await openIptvDatabase(this.databaseName)
    try {
      return await operation(database)
    } finally {
      database.close()
    }
  }

  async importList(input: ImportIptvListInput): Promise<IptvList> {
    if (input.channels.length === 0) {
      throw new Error('IPTV listesinde kaydedilecek kanal yok.')
    }
    const id = createId()
    const importedAt = input.importedAt ?? Date.now()
    const list: IptvList = {
      id,
      name: normalizeName(input.name),
      sourceType: input.sourceType,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      epgUrls: [...input.epgUrls],
      importedAt,
      updatedAt: importedAt,
      channelCount: input.channels.length,
    }

    return await this.withDatabase(async (database) => {
      const transaction = database.transaction(['lists', 'channels'], 'readwrite')
      const done = transactionDone(transaction)
      try {
        await requestValue(transaction.objectStore('lists').put(list))
        for (const [position, channel] of input.channels.entries()) {
          await requestValue(
            transaction
              .objectStore('channels')
              .put(storedChannel(id, channel, position)),
          )
        }
        await done
        return list
      } catch (error) {
        try {
          transaction.abort()
        } catch {
          // Transaction may already have aborted because of the failing request.
        }
        await done.catch(() => undefined)
        throw error
      }
    })
  }

  async replaceList(
    id: string,
    input: ImportIptvListInput,
  ): Promise<IptvList> {
    if (input.channels.length === 0) {
      throw new Error('IPTV listesinde kaydedilecek kanal yok.')
    }

    return await this.withDatabase(async (database) => {
      const transaction = database.transaction(['lists', 'channels'], 'readwrite')
      const done = transactionDone(transaction)
      try {
        const listStore = transaction.objectStore('lists')
        const existingValue = await requestValue(listStore.get(id))
        if (!isIptvList(existingValue)) {
          throw new Error('IPTV listesi bulunamadı.')
        }
        const updatedAt = input.importedAt ?? Date.now()
        const replacement: IptvList = {
          id,
          name: normalizeName(input.name),
          sourceType: input.sourceType,
          ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
          epgUrls: [...input.epgUrls],
          importedAt: existingValue.importedAt,
          updatedAt,
          channelCount: input.channels.length,
        }

        await deleteChannelsInTransaction(transaction, id)
        await requestValue(listStore.put(replacement))
        for (const [position, channel] of input.channels.entries()) {
          await requestValue(
            transaction
              .objectStore('channels')
              .put(storedChannel(id, channel, position)),
          )
        }
        await done
        return replacement
      } catch (error) {
        try {
          transaction.abort()
        } catch {
          // Transaction may already be inactive.
        }
        await done.catch(() => undefined)
        throw error
      }
    })
  }

  async listLists(): Promise<IptvList[]> {
    return await this.withDatabase(async (database) => {
      const transaction = database.transaction('lists', 'readonly')
      const values = await requestValue(transaction.objectStore('lists').getAll())
      await transactionDone(transaction)
      return values
        .filter(isIptvList)
        .sort((left, right) => right.updatedAt - left.updatedAt)
    })
  }

  async getList(id: string): Promise<IptvList | null> {
    return await this.withDatabase(async (database) => {
      const transaction = database.transaction('lists', 'readonly')
      const value = await requestValue(transaction.objectStore('lists').get(id))
      await transactionDone(transaction)
      return isIptvList(value) ? value : null
    })
  }

  async deleteList(id: string): Promise<void> {
    await this.withDatabase(async (database) => {
      const transaction = database.transaction(['lists', 'channels'], 'readwrite')
      const done = transactionDone(transaction)
      await deleteChannelsInTransaction(transaction, id)
      await requestValue(transaction.objectStore('lists').delete(id))
      await done
    })
  }

  async listChannels(listId: string): Promise<IptvChannel[]> {
    return await this.withDatabase(async (database) => {
      const transaction = database.transaction('channels', 'readonly')
      const values = await requestValue(
        transaction.objectStore('channels').index('listId').getAll(listId),
      )
      await transactionDone(transaction)
      return values
        .filter(isIptvChannel)
        .sort((left, right) => left.position - right.position)
    })
  }
}

export async function createIptvRepository(
  options: CreateIptvRepositoryOptions = {},
): Promise<IptvRepository> {
  const databaseName = options.databaseName ?? IPTV_DATABASE_NAME
  const database = await openIptvDatabase(databaseName)
  database.close()
  return new BrowserIptvRepository(databaseName)
}
