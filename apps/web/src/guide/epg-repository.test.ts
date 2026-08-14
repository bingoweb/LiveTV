import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { XmltvChannel, XmltvProgramme } from '@livetv/shared'
import { deleteEpgDatabase, openEpgDatabase } from './epg-db'
import {
  createEpgRepository,
  EPG_FUTURE_MS,
  EPG_PAST_MS,
  type EpgSourceRecord,
} from './epg-repository'

const databaseName = 'livetv-epg-test'
const NOW = Date.UTC(2026, 7, 14, 12, 0, 0)

function source(
  listId: string,
  sourceKey: string,
  position: number,
  overrides: Partial<EpgSourceRecord> = {},
): EpgSourceRecord {
  return {
    sourceKey,
    listId,
    sourceType: 'url',
    sourceUrl: `https://epg.example/${sourceKey}.xml`,
    position,
    fetchedAt: NOW,
    channelCount: 1,
    programmeCount: 1,
    warningCount: 0,
    ...overrides,
  }
}

function channel(id: string): XmltvChannel {
  return { id, displayNames: [`Channel ${id}`] }
}

function programme(
  channelId: string,
  title: string,
  startAt: number,
  stopAt = startAt + 60 * 60 * 1000,
): XmltvProgramme {
  return {
    channelId,
    startAt,
    stopAt,
    title,
    categories: [],
  }
}

describe('EPG IndexedDB repository', () => {
  beforeEach(async () => {
    await deleteEpgDatabase(databaseName)
  })

  afterEach(async () => {
    await deleteEpgDatabase(databaseName)
  })

  it('persists multiple ordered sources with normalized channel/programme rows', async () => {
    const repository = await createEpgRepository({ databaseName })
    await repository.replaceListSources({
      listId: 'list-1',
      now: NOW,
      sources: [
        {
          source: source('list-1', 'first', 0),
          channels: [channel('news')],
          programmes: [programme('news', 'Morning', NOW)],
        },
        {
          source: source('list-1', 'second', 1),
          channels: [channel('sports')],
          programmes: [programme('sports', 'Match', NOW + 2 * 60 * 60 * 1000)],
        },
      ],
    })

    const cache = await repository.readListCache('list-1')
    expect(
      cache.sources.map(({ sourceKey, position }) => ({ sourceKey, position })),
    ).toEqual([
      { sourceKey: 'first', position: 0 },
      { sourceKey: 'second', position: 1 },
    ])
    expect(
      cache.channels.map(({ sourceKey, xmltvId }) => ({ sourceKey, xmltvId })),
    ).toEqual([
      { sourceKey: 'first', xmltvId: 'news' },
      { sourceKey: 'second', xmltvId: 'sports' },
    ])
    expect(
      cache.programmes.map(({ sourceKey, title }) => ({ sourceKey, title })),
    ).toEqual([
      { sourceKey: 'first', title: 'Morning' },
      { sourceKey: 'second', title: 'Match' },
    ])
  })

  it('retains only the configured past/future programme window', async () => {
    const repository = await createEpgRepository({ databaseName })
    await repository.replaceListSources({
      listId: 'list-1',
      now: NOW,
      sources: [
        {
          source: source('list-1', 'source', 0),
          channels: [channel('news')],
          programmes: [
            programme(
              'news',
              'Too old',
              NOW - EPG_PAST_MS - 2 * 60 * 60 * 1000,
            ),
            programme(
              'news',
              'Current',
              NOW - 30 * 60 * 1000,
              NOW + 30 * 60 * 1000,
            ),
            programme('news', 'Future', NOW + EPG_FUTURE_MS - 60 * 60 * 1000),
            programme('news', 'Too far', NOW + EPG_FUTURE_MS + 60 * 60 * 1000),
          ],
        },
      ],
    })

    expect(
      (await repository.readListCache('list-1')).programmes.map(
        ({ title }) => title,
      ),
    ).toEqual(['Current', 'Future'])
  })

  it('rolls back a failed replacement and preserves the previous valid cache', async () => {
    const repository = await createEpgRepository({ databaseName })
    await repository.replaceListSources({
      listId: 'list-1',
      now: NOW,
      sources: [
        {
          source: source('list-1', 'old', 0),
          channels: [channel('news')],
          programmes: [programme('news', 'Old', NOW)],
        },
      ],
    })

    const invalidProgramme = {
      ...programme('news', 'New', NOW),
      description: (() => 'not cloneable') as unknown as string,
    }
    await expect(
      repository.replaceListSources({
        listId: 'list-1',
        now: NOW,
        sources: [
          {
            source: source('list-1', 'new', 0),
            channels: [channel('news')],
            programmes: [invalidProgramme],
          },
        ],
      }),
    ).rejects.toBeTruthy()

    expect(
      (await repository.readListCache('list-1')).programmes.map(
        ({ title }) => title,
      ),
    ).toEqual(['Old'])
  })

  it('deletes a list cache and removes orphan list caches', async () => {
    const repository = await createEpgRepository({ databaseName })
    for (const listId of ['keep', 'drop']) {
      await repository.replaceListSources({
        listId,
        now: NOW,
        sources: [
          {
            source: source(listId, `${listId}-source`, 0),
            channels: [channel('news')],
            programmes: [programme('news', listId, NOW)],
          },
        ],
      })
    }

    await repository.removeOrphanLists(['keep'])
    expect((await repository.readListCache('keep')).sources).toHaveLength(1)
    expect((await repository.readListCache('drop')).sources).toEqual([])

    await repository.deleteListCache('keep')
    expect((await repository.readListCache('keep')).sources).toEqual([])
  })

  it('skips malformed stored rows while preserving valid rows', async () => {
    const repository = await createEpgRepository({ databaseName })
    await repository.replaceListSources({
      listId: 'list-1',
      now: NOW,
      sources: [
        {
          source: source('list-1', 'valid', 0),
          channels: [channel('news')],
          programmes: [programme('news', 'Valid', NOW)],
        },
      ],
    })

    const database = await openEpgDatabase(databaseName)
    const transaction = database.transaction(
      ['sources', 'channels', 'programmes'],
      'readwrite',
    )
    transaction.objectStore('sources').put({ sourceKey: 'broken', listId: 42 })
    transaction
      .objectStore('channels')
      .put({ id: 'broken', sourceKey: 'valid', xmltvId: 42 })
    transaction.objectStore('programmes').put({
      id: 'broken',
      sourceKey: 'valid',
      xmltvChannelId: 'news',
      startAt: 'wrong',
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()

    const cache = await repository.readListCache('list-1')
    expect(cache.sources).toHaveLength(1)
    expect(cache.channels).toHaveLength(1)
    expect(cache.programmes).toHaveLength(1)
  })
})
