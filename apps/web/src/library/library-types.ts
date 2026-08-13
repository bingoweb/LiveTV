import type { PlayerSource } from '@livetv/player-core'

import { createSourceKey } from './source-key'

export type LibrarySourceKind = 'youtube' | 'hls' | 'video' | 'audio'

export type LibrarySource = {
  sourceKey: string
  url: string
  kind: LibrarySourceKind
  title: string
  thumbnailUrl?: string
  channelUrl?: string
}

export type LibrarySourceMetadata = Partial<
  Pick<LibrarySource, 'title' | 'thumbnailUrl' | 'channelUrl'>
>

export function toLibrarySource(
  source: PlayerSource,
  metadata: LibrarySourceMetadata = {},
): LibrarySource {
  const kind: LibrarySourceKind =
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
