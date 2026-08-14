import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { IptvContextValue } from '../iptv/iptv-context'
import type { IptvChannel, IptvList } from '../iptv/iptv-repository'
import { IptvLibraryView } from './IptvLibrary'

function list(overrides: Partial<IptvList> = {}): IptvList {
  return {
    id: 'list-1',
    name: 'Haberler',
    sourceType: 'url',
    sourceUrl: 'https://lists.example/haber.m3u',
    epgUrls: ['https://epg.example/guide.xml'],
    importedAt: 1,
    updatedAt: 2,
    channelCount: 1,
    ...overrides,
  }
}

function channel(
  index: number,
  overrides: Partial<IptvChannel> = {},
): IptvChannel {
  return {
    id: `channel-${index}`,
    listId: 'list-1',
    position: index,
    searchText: `kanal ${index}`,
    name: `Kanal ${index}`,
    streamUrl: `https://cdn.example/${index}.m3u8`,
    groupTitle: index % 2 === 0 ? 'Haber' : 'Spor',
    ...overrides,
  }
}

function context(overrides: Partial<IptvContextValue> = {}): IptvContextValue {
  return {
    status: 'ready',
    lists: [list()],
    activeListId: 'list-1',
    channels: [channel(0)],
    importUrl: async () => {},
    importFile: async () => {},
    importText: async () => {},
    selectList: async () => {},
    refreshList: async () => {},
    deleteList: async () => {},
    ...overrides,
  }
}

const noOp = () => {}

describe('IptvLibraryView', () => {
  it('renders storage loading and unavailable states without hiding the route purpose', () => {
    const loading = renderToStaticMarkup(
      <IptvLibraryView
        iptv={context({
          status: 'loading',
          lists: [],
          channels: [],
          activeListId: null,
        })}
        query=""
        group={null}
        visibleLimit={200}
        importName=""
        importUrl=""
        pasteText=""
        onQueryChange={noOp}
        onGroupChange={noOp}
        onShowMore={noOp}
        onSelectList={noOp}
        onPlayChannel={noOp}
      />,
    )
    const unavailable = renderToStaticMarkup(
      <IptvLibraryView
        iptv={context({
          status: 'unavailable',
          lists: [],
          channels: [],
          activeListId: null,
        })}
        query=""
        group={null}
        visibleLimit={200}
        importName=""
        importUrl=""
        pasteText=""
        onQueryChange={noOp}
        onGroupChange={noOp}
        onShowMore={noOp}
        onSelectList={noOp}
        onPlayChannel={noOp}
      />,
    )

    expect(loading).toContain('IPTV kütüphanesi yükleniyor')
    expect(unavailable).toContain('IPTV kütüphanesi kullanılamıyor')
    expect(unavailable).toContain('Doğrudan yayın URL’si')
  })

  it('renders URL refresh only for URL-backed lists', () => {
    const urlMarkup = renderToStaticMarkup(
      <IptvLibraryView
        iptv={context()}
        query=""
        group={null}
        visibleLimit={200}
        importName=""
        importUrl=""
        pasteText=""
        onQueryChange={noOp}
        onGroupChange={noOp}
        onShowMore={noOp}
        onSelectList={noOp}
        onPlayChannel={noOp}
      />,
    )
    const fileMarkup = renderToStaticMarkup(
      <IptvLibraryView
        iptv={context({
          lists: [list({ sourceType: 'file', sourceUrl: undefined })],
        })}
        query=""
        group={null}
        visibleLimit={200}
        importName=""
        importUrl=""
        pasteText=""
        onQueryChange={noOp}
        onGroupChange={noOp}
        onShowMore={noOp}
        onSelectList={noOp}
        onPlayChannel={noOp}
      />,
    )

    expect(urlMarkup).toContain('Listeyi yenile')
    expect(fileMarkup).not.toContain('Listeyi yenile')
  })

  it('filters channels and renders only the visible limit with a show-more action', () => {
    const channels = Array.from({ length: 205 }, (_, index) => channel(index))
    const markup = renderToStaticMarkup(
      <IptvLibraryView
        iptv={context({ channels, lists: [list({ channelCount: 205 })] })}
        query=""
        group={null}
        visibleLimit={200}
        importName=""
        importUrl=""
        pasteText=""
        onQueryChange={noOp}
        onGroupChange={noOp}
        onShowMore={noOp}
        onSelectList={noOp}
        onPlayChannel={noOp}
      />,
    )

    expect(markup.match(/class="iptv-channel-row"/g)).toHaveLength(200)
    expect(markup).toContain('205 sonuç')
    expect(markup).toContain('Daha fazla göster')
    expect(markup).toContain('Haber')
    expect(markup).toContain('Spor')
  })

  it('renders the latest non-fatal import warning notice', () => {
    const markup = renderToStaticMarkup(
      <IptvLibraryView
        iptv={context({ noticeMessage: '2 geçersiz M3U kaydı atlandı.' })}
        query=""
        group={null}
        visibleLimit={200}
        importName=""
        importUrl=""
        pasteText=""
        actionMessage="IPTV metni içe aktarıldı."
        onQueryChange={noOp}
        onGroupChange={noOp}
        onShowMore={noOp}
        onSelectList={noOp}
        onPlayChannel={noOp}
      />,
    )

    expect(markup).toContain('2 geçersiz M3U kaydı atlandı.')
  })
})
