import type { PlayerSource } from '@livetv/player-core'

import type { TorrentLibrarySource } from '../torrent/torrent-types'
import { createSourceKey } from './source-key'

export type LibrarySourceKind =
  'youtube' | 'hls' | 'video' | 'audio' | 'torrent'

export type StandardLibrarySource = {
  sourceKey: string
  url: string
  kind: Exclude<LibrarySourceKind, 'torrent'>
  title: string
  thumbnailUrl?: string
  channelUrl?: string
}

export type LibrarySource = StandardLibrarySource | TorrentLibrarySource

export type LibrarySourceMetadata = {
  title?: string
  thumbnailUrl?: string
  channelUrl?: string
}

export function toLibrarySource(
  source: PlayerSource,
  metadata: LibrarySourceMetadata = {},
): LibrarySource {
  const kind: StandardLibrarySource['kind'] =
    source.kind === 'youtube'
      ? 'youtube'
      : source.kind === 'hls'
        ? 'hls'
        : source.mediaType === 'audio'
          ? 'audio'
          : 'video'

  return {
    sourceKey: createSourceKey(source),
    url: source.url,
    kind,
    title: metadata.title ?? source.url,
    ...(metadata.thumbnailUrl
      ? { thumbnailUrl: metadata.thumbnailUrl }
      : undefined),
    ...(metadata.channelUrl ? { channelUrl: metadata.channelUrl } : undefined),
  }
}
