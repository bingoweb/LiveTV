import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  createIptvController,
  IptvProvider,
  type IptvImporters,
} from './iptv-context'
import type {
  ImportIptvListInput,
  IptvChannel,
  IptvList,
  IptvRepository,
} from './iptv-repository'

class MemoryIptvRepository implements IptvRepository {
  lists: IptvList[] = []
  channels = new Map<string, IptvChannel[]>()
  nextId = 1

  async importList(input: ImportIptvListInput): Promise<IptvList> {
    const id = `list-${this.nextId++}`
    const importedAt = input.importedAt ?? this.nextId
    const list: IptvList = {
      id,
      name: input.name,
      sourceType: input.sourceType,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      epgUrls: input.epgUrls,
      importedAt,
      updatedAt: importedAt,
      channelCount: input.channels.length,
    }
    this.lists = [list, ...this.lists]
    this.channels.set(
      id,
      input.channels.map((channel, position) => ({
        ...channel,
        id: `${id}-${position}`,
        listId: id,
        position,
        searchText: channel.name.toLowerCase(),
      })),
    )
    return list
  }

  async replaceList(id: string, input: ImportIptvListInput): Promise<IptvList> {
    const existing = this.lists.find((list) => list.id === id)
    if (!existing) throw new Error('missing')
    const list: IptvList = {
      ...existing,
      name: input.name,
      sourceType: input.sourceType,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      epgUrls: input.epgUrls,
      updatedAt: input.importedAt ?? existing.updatedAt + 1,
      channelCount: input.channels.length,
    }
    this.lists = this.lists.map((item) => (item.id === id ? list : item))
    this.channels.set(
      id,
      input.channels.map((channel, position) => ({
        ...channel,
        id: `${id}-r-${position}`,
        listId: id,
        position,
        searchText: channel.name.toLowerCase(),
      })),
    )
    return list
  }

  async listLists() {
    return [...this.lists]
  }

  async getList(id: string) {
    return this.lists.find((list) => list.id === id) ?? null
  }

  async deleteList(id: string) {
    this.lists = this.lists.filter((list) => list.id !== id)
    this.channels.delete(id)
  }

  async listChannels(listId: string) {
    return [...(this.channels.get(listId) ?? [])]
  }
}

function importers(overrides: Partial<IptvImporters> = {}): IptvImporters {
  const result = {
    playlist: {
      channels: [{ name: 'Yeni Kanal', streamUrl: 'https://new.example/live.m3u8' }],
      epgUrls: ['https://epg.example/new.xml'],
      warnings: [],
    },
    suggestedName: 'Yeni Liste',
  }
  return {
    fromUrl: async () => result,
    fromFile: async () => result,
    fromText: () => result,
    ...overrides,
  }
}

async function seededRepository() {
  const repository = new MemoryIptvRepository()
  await repository.importList({
    name: 'Birinci',
    sourceType: 'paste',
    epgUrls: [],
    channels: [{ name: 'A', streamUrl: 'https://a.example/live.m3u8' }],
  })
  await repository.importList({
    name: 'İkinci',
    sourceType: 'url',
    sourceUrl: 'https://lists.example/two.m3u',
    epgUrls: [],
    channels: [{ name: 'B', streamUrl: 'https://b.example/live.m3u8' }],
  })
  return repository
}

describe('IPTV controller/provider', () => {
  it('initializes with the first stored list and its channels', async () => {
    const repository = await seededRepository()
    const controller = createIptvController({
      repositoryFactory: async () => repository,
      importers: importers(),
    })

    await controller.initialize()

    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      lists: [{ name: 'İkinci' }, { name: 'Birinci' }],
      activeListId: 'list-2',
      channels: [{ name: 'B' }],
    })
  })

  it('selects imported and explicitly selected lists', async () => {
    const repository = await seededRepository()
    const controller = createIptvController({
      repositoryFactory: async () => repository,
      importers: importers(),
    })
    await controller.initialize()

    await controller.importText('#EXTM3U', 'Eklenen')
    expect(controller.getSnapshot()).toMatchObject({
      activeListId: 'list-3',
      channels: [{ name: 'Yeni Kanal' }],
    })

    await controller.selectList('list-1')
    expect(controller.getSnapshot()).toMatchObject({
      activeListId: 'list-1',
      channels: [{ name: 'A' }],
    })
  })

  it('deletes the active list and selects a remaining list', async () => {
    const repository = await seededRepository()
    const controller = createIptvController({
      repositoryFactory: async () => repository,
      importers: importers(),
    })
    await controller.initialize()

    await controller.deleteList('list-2')

    expect(controller.getSnapshot()).toMatchObject({
      lists: [{ id: 'list-1' }],
      activeListId: 'list-1',
      channels: [{ name: 'A' }],
    })
  })

  it('becomes unavailable when repository initialization fails', async () => {
    const controller = createIptvController({
      repositoryFactory: async () => {
        throw new Error('blocked')
      },
      importers: importers(),
    })

    await controller.initialize()

    expect(controller.getSnapshot()).toMatchObject({
      status: 'unavailable',
      lists: [],
      channels: [],
    })
  })

  it('preserves stored channels when URL refresh fails', async () => {
    const repository = await seededRepository()
    const controller = createIptvController({
      repositoryFactory: async () => repository,
      importers: importers({
        fromUrl: async () => {
          throw new Error('CORS engeli')
        },
      }),
    })
    await controller.initialize()
    const before = controller.getSnapshot()

    await expect(controller.refreshList('list-2')).rejects.toThrow('CORS engeli')

    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      activeListId: before.activeListId,
      channels: before.channels,
      errorMessage: 'CORS engeli',
    })
  })

  it('renders provider children during server rendering before IndexedDB initialization', () => {
    const markup = renderToStaticMarkup(
      <IptvProvider repositoryFactory={async () => new MemoryIptvRepository()}>
        <span>çocuk içerik</span>
      </IptvProvider>,
    )

    expect(markup).toContain('çocuk içerik')
  })
})
