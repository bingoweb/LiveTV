import type { PlayerSource } from '@livetv/player-core'

import type { LibrarySource } from './library-types'

export function createSourceKey(source: PlayerSource | LibrarySource): string {
  if ('sourceKey' in source) return source.sourceKey

  if (source.kind === 'youtube') {
    return `youtube:${source.videoId}`
  }

  const kind =
    source.kind === 'hls'
      ? 'hls'
      : source.mediaType === 'audio'
        ? 'audio'
        : 'video'

  let normalizedUrl = source.url.trim()
  try {
    const url = new URL(normalizedUrl)
    url.hash = ''
    normalizedUrl = url.toString()
  } catch {
    // Keep the trimmed source string so identity generation never breaks playback.
  }

  return `${kind}:${normalizedUrl}`
}
