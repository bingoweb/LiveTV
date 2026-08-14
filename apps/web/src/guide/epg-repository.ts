import type { XmltvChannel, XmltvProgramme } from '@livetv/shared'

import { openEpgDatabase } from './epg-db'

export const EPG_FRESH_MS = 6 * 60 * 60 * 1000
export const EPG_PAST_MS = 12 * 60 * 60 * 1000
export const EPG_FUTURE_MS = 8 * 24 * 60 * 60 * 1000

export type EpgSourceRecord = {
  sourceKey: string
  listId: string
  sourceType: 'url' | 'file'
  sourceUrl?: string
  position: number
  fetchedAt: number
  channelCount: number
  programmeCount: number
  warningCount: number
}

export type EpgChannelRecord = {
  id: string
  sourceKey: string
  xmltvId: string
  displayNames: string[]
  iconUrl?: string
}

export type EpgProgrammeRecord = {
  id: string
  sourceKey: string
  xmltvChannelId: string
  startAt: number
  stopAt: number
  title: string
  subTitle?: string
  description?: string
  categories: string[]
  iconUrl?: string
}

export type EpgListCache = {
  sources: EpgSourceRecord[]
  channels: EpgChannelRecord[]
  programmes: EpgProgrammeRecord[]
}

export interface EpgRepository {
  replaceListSources(input: {
    listId: string
    sources: Array<{
      source: EpgSourceRecord
      channels: XmltvChannel[]
      programmes: XmltvProgramme[]
    }>
    now: number
  }): Promise<void>
  readListCache(listId: string): Promise<EpgListCache>
  deleteListCache(listId: string): Promise<void>
  removeOrphanLists(validListIds: readonly string[]): Promise<void>
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('EPG transaction aborted.'))
  })
}

function validSource(value: unknown): value is EpgSourceRecord {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.sourceKey === 'string' &&
    typeof row.listId === 'string' &&
    (row.sourceType === 'url' || row.sourceType === 'file') &&
    typeof row.position === 'number' &&
    Number.isFinite(row.position) &&
    typeof row.fetchedAt === 'number' &&
    Number.isFinite(row.fetchedAt) &&
    typeof row.channelCount === 'number' &&
    typeof row.programmeCount === 'number' &&
    typeof row.warningCount === 'number' &&
    (row.sourceUrl === undefined || typeof row.sourceUrl === 'string')
  )
}

function validChannel(value: unknown): value is EpgChannelRecord {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.sourceKey === 'string' &&
    typeof row.xmltvId === 'string' &&
    Array.isArray(row.displayNames) &&
    row.displayNames.every((name) => typeof name === 'string') &&
    (row.iconUrl === undefined || typeof row.iconUrl === 'string')
  )
}

function validProgramme(value: unknown): value is EpgProgrammeRecord {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    typeof row.id === 'string' &&
    typeof row.sourceKey === 'string' &&
    typeof row.xmltvChannelId === 'string' &&
    typeof row.startAt === 'number' &&
    Number.isFinite(row.startAt) &&
    typeof row.stopAt === 'number' &&
    Number.isFinite(row.stopAt) &&
    typeof row.title === 'string' &&
    Array.isArray(row.categories) &&
    row.categories.every((category) => typeof category === 'string') &&
    (row.subTitle === undefined || typeof row.subTitle === 'string') &&
    (row.description === undefined || typeof row.description === 'string') &&
    (row.iconUrl === undefined || typeof row.iconUrl === 'string')
  )
}

function channelRecord(
  sourceKey: string,
  channel: XmltvChannel,
): EpgChannelRecord {
  return {
    id: JSON.stringify([sourceKey, channel.id]),
    sourceKey,
    xmltvId: channel.id,
    displayNames: channel.displayNames,
    ...(channel.iconUrl ? { iconUrl: channel.iconUrl } : {}),
  }
}

function programmeRecord(
  sourceKey: string,
  programme: XmltvProgramme,
): EpgProgrammeRecord {
  return {
    id: JSON.stringify([
      sourceKey,
      programme.channelId,
      programme.startAt,
      programme.stopAt,
      programme.title,
    ]),
    sourceKey,
    xmltvChannelId: programme.channelId,
    startAt: programme.startAt,
    stopAt: programme.stopAt,
    title: programme.title,
    ...(programme.subTitle ? { subTitle: programme.subTitle } : {}),
    ...(programme.description ? { description: programme.description } : {}),
    categories: programme.categories,
    ...(programme.iconUrl ? { iconUrl: programme.iconUrl } : {}),
  }
}

async function getRowsForSourceKeys(
  database: IDBDatabase,
  storeName: 'channels' | 'programmes',
  sourceKeys: readonly string[],
) {
  if (sourceKeys.length === 0) return []
  const transaction = database.transaction(storeName, 'readonly')
  const done = transactionDone(transaction)
  const index = transaction.objectStore(storeName).index('sourceKey')
  const groups = await Promise.all(
    sourceKeys.map((sourceKey) =>
      requestResult(index.getAll(IDBKeyRange.only(sourceKey))),
    ),
  )
  await done
  return groups.flat()
}

async function deleteListRowsInTransaction(
  transaction: IDBTransaction,
  listId: string,
) {
  const sources = transaction.objectStore('sources')
  const sourceRows = await requestResult(
    sources.index('listId').getAll(IDBKeyRange.only(listId)),
  )
  const sourceKeys = sourceRows
    .filter(validSource)
    .map(({ sourceKey }) => sourceKey)
  const channels = transaction.objectStore('channels').index('sourceKey')
  const programmes = transaction.objectStore('programmes').index('sourceKey')

  for (const sourceKey of sourceKeys) {
    for (const row of await requestResult(
      channels.getAll(IDBKeyRange.only(sourceKey)),
    )) {
      if (validChannel(row)) transaction.objectStore('channels').delete(row.id)
    }
    for (const row of await requestResult(
      programmes.getAll(IDBKeyRange.only(sourceKey)),
    )) {
      if (validProgramme(row))
        transaction.objectStore('programmes').delete(row.id)
    }
    sources.delete(sourceKey)
  }
}

export async function createEpgRepository(
  options: { databaseName?: string } = {},
): Promise<EpgRepository> {
  const databaseName = options.databaseName
  const initialDatabase = await openEpgDatabase(databaseName)
  initialDatabase.close()

  const withDatabase = async <T>(
    operation: (database: IDBDatabase) => Promise<T>,
  ) => {
    const database = await openEpgDatabase(databaseName)
    try {
      return await operation(database)
    } finally {
      database.close()
    }
  }

  const replaceListSources: EpgRepository['replaceListSources'] = async ({
    listId,
    sources,
    now,
  }) => {
    await withDatabase(async (database) => {
      const transaction = database.transaction(
        ['sources', 'channels', 'programmes'],
        'readwrite',
      )
      const done = transactionDone(transaction)
      try {
        await deleteListRowsInTransaction(transaction, listId)
        const sourceStore = transaction.objectStore('sources')
        const channelStore = transaction.objectStore('channels')
        const programmeStore = transaction.objectStore('programmes')
        const minStop = now - EPG_PAST_MS
        const maxStart = now + EPG_FUTURE_MS

        for (const entry of sources) {
          sourceStore.put(entry.source)
          for (const channel of entry.channels) {
            channelStore.put(channelRecord(entry.source.sourceKey, channel))
          }
          for (const programme of entry.programmes) {
            if (programme.stopAt < minStop || programme.startAt > maxStart)
              continue
            programmeStore.put(
              programmeRecord(entry.source.sourceKey, programme),
            )
          }
        }
      } catch (error) {
        transaction.abort()
        await done.catch(() => undefined)
        throw error
      }
      await done
    })
  }

  const readListCache: EpgRepository['readListCache'] = async (listId) =>
    await withDatabase(async (database) => {
      const sourceTransaction = database.transaction('sources', 'readonly')
      const sourceDone = transactionDone(sourceTransaction)
      const sourceRows = await requestResult(
        sourceTransaction
          .objectStore('sources')
          .index('listId')
          .getAll(IDBKeyRange.only(listId)),
      )
      await sourceDone
      const sources = sourceRows
        .filter(validSource)
        .sort((a, b) => a.position - b.position)
      const sourceKeys = sources.map(({ sourceKey }) => sourceKey)
      const channelRows = await getRowsForSourceKeys(
        database,
        'channels',
        sourceKeys,
      )
      const programmeRows = await getRowsForSourceKeys(
        database,
        'programmes',
        sourceKeys,
      )
      const order = new Map(sourceKeys.map((key, index) => [key, index]))
      const channels = channelRows
        .filter(validChannel)
        .sort(
          (a, b) =>
            (order.get(a.sourceKey) ?? Number.MAX_SAFE_INTEGER) -
              (order.get(b.sourceKey) ?? Number.MAX_SAFE_INTEGER) ||
            a.xmltvId.localeCompare(b.xmltvId),
        )
      const programmes = programmeRows
        .filter(validProgramme)
        .sort(
          (a, b) =>
            (order.get(a.sourceKey) ?? Number.MAX_SAFE_INTEGER) -
              (order.get(b.sourceKey) ?? Number.MAX_SAFE_INTEGER) ||
            a.startAt - b.startAt ||
            a.title.localeCompare(b.title),
        )
      return { sources, channels, programmes }
    })

  const deleteListCache: EpgRepository['deleteListCache'] = async (listId) => {
    await withDatabase(async (database) => {
      const transaction = database.transaction(
        ['sources', 'channels', 'programmes'],
        'readwrite',
      )
      const done = transactionDone(transaction)
      try {
        await deleteListRowsInTransaction(transaction, listId)
      } catch (error) {
        transaction.abort()
        await done.catch(() => undefined)
        throw error
      }
      await done
    })
  }

  const removeOrphanLists: EpgRepository['removeOrphanLists'] = async (
    validListIds,
  ) => {
    const sourceRows = await withDatabase(async (database) => {
      const transaction = database.transaction('sources', 'readonly')
      const done = transactionDone(transaction)
      const sourceRows = await requestResult(
        transaction.objectStore('sources').getAll(),
      )
      await done
      return sourceRows
    })
    const valid = new Set(validListIds)
    const orphanListIds = new Set(
      sourceRows
        .filter(validSource)
        .map(({ listId }) => listId)
        .filter((listId) => !valid.has(listId)),
    )
    for (const listId of orphanListIds) {
      await deleteListCache(listId)
    }
  }

  return {
    replaceListSources,
    readListCache,
    deleteListCache,
    removeOrphanLists,
  }
}
