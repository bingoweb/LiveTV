import type { PlayerSource } from '@livetv/player-core'
import { describe, expect, it } from 'vitest'

import type { LibrarySource } from './library-types'
import { resolvePlayerLibrarySource } from './player-library-source'

const directSource: PlayerSource = {
  kind: 'direct',
  originalUrl: '/webtorrent/hash/Movie/Sintel.mp4',
  url: '/webtorrent/hash/Movie/Sintel.mp4',
  mediaType: 'video',
}

const torrentOverride: LibrarySource = {
  sourceKey:
    'torrent:0123456789abcdef0123456789abcdef01234567:Movie%2FSintel.mp4',
  kind: 'torrent',
  url: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
  title: 'Sintel.mp4',
  torrentFilePath: 'Movie/Sintel.mp4',
  torrentMediaType: 'video',
}

describe('resolvePlayerLibrarySource', () => {
  it('prefers a stable library override over the temporary player URL', () => {
    expect(
      resolvePlayerLibrarySource({
        source: directSource,
        override: torrentOverride,
        title: 'Temporary stream',
      }),
    ).toBe(torrentOverride)
  })

  it('derives the ordinary direct source when there is no override', () => {
    expect(
      resolvePlayerLibrarySource({
        source: directSource,
        override: null,
        title: 'Direct video',
      }),
    ).toMatchObject({
      kind: 'video',
      url: directSource.url,
      title: 'Direct video',
    })
  })
})
