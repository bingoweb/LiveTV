import type { PlayerSource } from '@livetv/player-core'

import type { LibrarySource } from './library-types'
import { toLibrarySource } from './library-types'

export function resolvePlayerLibrarySource(input: {
  source: PlayerSource | null
  override: LibrarySource | null
  title: string
  thumbnailUrl?: string
  channelUrl?: string
}): LibrarySource | null {
  if (!input.source) return null
  if (input.override) return input.override

  return toLibrarySource(input.source, {
    title: input.title,
    ...(input.thumbnailUrl ? { thumbnailUrl: input.thumbnailUrl } : {}),
    ...(input.channelUrl ? { channelUrl: input.channelUrl } : {}),
  })
}
