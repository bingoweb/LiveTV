import 'fake-indexeddb/auto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { deleteIptvDatabase, openIptvDatabase } from './iptv-db'
import {
  createIptvRepository,
  type ImportIptvListInput,
} from './iptv-repository'

const databaseName = 'livetv-iptv-test'

function input(
  name: string,
  streamUrls: readonly string[],
  overrides: Partial<ImportIptvListInput> = {},
): ImportIptvListInput {
  return {
    name,
    sourceType: 'paste',
    epgUrls: ['https://epg.example/guide.xml'],
    channels: streamUrls.map((streamUrl, index) => ({
      name: `${name} ${index + 1}`,
      streamUrl,
      groupTitle: index % 2 === 0 ? 'Haber' : 'Spor',
    })),
    importedAt: 1_000,
    ...overrides,
  }
}

describe('IPTV IndexedDB repository', () => {
  beforeEach(async () => {
    await deleteIptvDatabase(databaseName)
  })

  afterEach(async () => {
    await deleteIptvDatabase(databaseName)
  })

  it('persists imported list metadata and channel order across repository instances', async () => {
    const repository = await createIptvRepository({ databaseName })
    const list = await repository.importList(
      input(
        'Haber Paketi',
        ['https://example.com/a.m3u8', 'https://example.com/b.m3u8'],
        {
          sourceType: 'url',
          sourceUrl: 'https://lists.example/main.m3u',
        },
      ),
    )

    const reopened = await createIptvRepository({ databaseName })
    expect(await reopened.getList(list.id)).toMatchObject({
      name: 'Haber Paketi',
      sourceType: 'url',
      sourceUrl: 'https://lists.example/main.m3u',
      channelCount: 2,
      epgUrls: ['https://epg.example/guide.xml'],
    })
    expect(
      (await reopened.listChannels(list.id)).map(({ position, streamUrl }) => ({
        position,
        streamUrl,
      })),
    ).toEqual([
      { position: 0, streamUrl: 'https://example.com/a.m3u8' },
      { position: 1, streamUrl: 'https://example.com/b.m3u8' },
    ])
  })

  it('keeps multiple stored lists isolated', async () => {
    const repository = await createIptvRepository({ databaseName })
    const first = await repository.importList(
      input('Bir', ['https://one.example/live.m3u8']),
    )
    const second = await repository.importList(
      input('İki', ['https://two.example/live.m3u8'], { importedAt: 1_001 }),
    )

    expect((await repository.listLists()).map(({ id }) => id)).toEqual([
      second.id,
      first.id,
    ])
    expect((await repository.listChannels(first.id))[0]?.streamUrl).toBe(
      'https://one.example/live.m3u8',
    )
    expect((await repository.listChannels(second.id))[0]?.streamUrl).toBe(
      'https://two.example/live.m3u8',
    )
  })

  it('deletes channel rows with their list', async () => {
    const repository = await createIptvRepository({ databaseName })
    const list = await repository.importList(
      input('Silinecek', [
        'https://example.com/one.m3u8',
        'https://example.com/two.m3u8',
      ]),
    )

    await repository.deleteList(list.id)

    expect(await repository.getList(list.id)).toBeNull()
    expect(await repository.listChannels(list.id)).toEqual([])
  })

  it('skips malformed persisted rows while preserving valid data', async () => {
    const repository = await createIptvRepository({ databaseName })
    const list = await repository.importList(
      input('Sağlam', ['https://example.com/live.m3u8']),
    )
    const database = await openIptvDatabase(databaseName)
    const transaction = database.transaction(['lists', 'channels'], 'readwrite')
    transaction.objectStore('lists').put({ id: 'broken', name: 42 })
    transaction.objectStore('channels').put({
      id: 'broken-channel',
      listId: list.id,
      position: 'wrong',
      streamUrl: 'notaurl',
    })
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()

    expect(await repository.listLists()).toHaveLength(1)
    expect(await repository.listChannels(list.id)).toHaveLength(1)
  })

  it('replaces a list transactionally and preserves its original importedAt', async () => {
    const repository = await createIptvRepository({ databaseName })
    const list = await repository.importList(
      input('URL Liste', ['https://example.com/old.m3u8'], {
        sourceType: 'url',
        sourceUrl: 'https://lists.example/live.m3u',
        importedAt: 100,
      }),
    )

    const replaced = await repository.replaceList(
      list.id,
      input(
        'URL Liste',
        ['https://example.com/new-1.m3u8', 'https://example.com/new-2.m3u8'],
        {
          sourceType: 'url',
          sourceUrl: 'https://lists.example/live.m3u',
          importedAt: 500,
        },
      ),
    )

    expect(replaced.importedAt).toBe(100)
    expect(replaced.updatedAt).toBe(500)
    expect(replaced.channelCount).toBe(2)
    expect(
      (await repository.listChannels(list.id)).map(
        ({ streamUrl }) => streamUrl,
      ),
    ).toEqual([
      'https://example.com/new-1.m3u8',
      'https://example.com/new-2.m3u8',
    ])
  })

  it('rolls back a failed replacement so the previous list remains intact', async () => {
    const repository = await createIptvRepository({ databaseName })
    const list = await repository.importList(
      input('Korunacak', ['https://example.com/original.m3u8']),
    )
    const invalid = input('Bozuk yenileme', ['https://example.com/new.m3u8'])
    invalid.channels[0] = {
      ...invalid.channels[0]!,
      logoUrl: (() => 'not cloneable') as unknown as string,
    }

    await expect(repository.replaceList(list.id, invalid)).rejects.toBeTruthy()

    expect(await repository.getList(list.id)).toMatchObject({
      name: 'Korunacak',
      channelCount: 1,
    })
    expect((await repository.listChannels(list.id))[0]?.streamUrl).toBe(
      'https://example.com/original.m3u8',
    )
  })
})
