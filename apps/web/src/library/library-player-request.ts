import type { PlayerSourcePreference } from '@livetv/player-core'

import type { LibrarySource } from './library-types'

export type PlayerOpenRequest = {
  id: number
  source: LibrarySource
}

export function playerPreferenceForLibrarySource(
  source: LibrarySource,
): PlayerSourcePreference {
  switch (source.kind) {
    case 'youtube':
      return 'youtube'
    case 'hls':
      return 'hls'
    case 'audio':
      return 'direct-audio'
    case 'video':
      return 'direct-video'
    case 'torrent':
      throw new Error('Torrent kaynaklarını Torrent panelinden aç.')
  }
}

export function createPlayerOpenRequest(
  previousId: number,
  source: LibrarySource,
): PlayerOpenRequest {
  return { id: previousId + 1, source }
}
