import type { PlayerSourcePreference } from '@livetv/player-core'

import type { ParsedIptvChannel } from '../iptv/m3u-types'
import type { IptvChannel } from '../iptv/iptv-repository'
import { playerPreferenceForLibrarySource } from '../library/library-player-request'
import type { LibrarySource } from '../library/library-types'

export type PlayerOpenRequest = {
  id: number
  url: string
  preference: PlayerSourcePreference
  title?: string
  thumbnailUrl?: string
  channelUrl?: string
}

export type PlayerOpenRequestInput = Omit<PlayerOpenRequest, 'id'>

export function createPlayerOpenRequest(
  previousId: number,
  input: PlayerOpenRequestInput,
): PlayerOpenRequest {
  return { id: previousId + 1, ...input }
}

export function playerRequestForLibrarySource(
  previousId: number,
  source: LibrarySource,
): PlayerOpenRequest {
  return createPlayerOpenRequest(previousId, {
    url: source.url,
    preference: playerPreferenceForLibrarySource(source),
    title: source.title,
    ...(source.thumbnailUrl ? { thumbnailUrl: source.thumbnailUrl } : {}),
    ...(source.channelUrl ? { channelUrl: source.channelUrl } : {}),
  })
}

export function playerPreferenceForIptvChannel(
  channel: ParsedIptvChannel,
): PlayerSourcePreference {
  try {
    return new URL(channel.streamUrl).pathname.toLowerCase().endsWith('.m3u8')
      ? 'hls'
      : 'auto'
  } catch {
    return 'auto'
  }
}

export function playerRequestForIptvChannel(
  previousId: number,
  channel: IptvChannel,
): PlayerOpenRequest {
  return createPlayerOpenRequest(previousId, {
    url: channel.streamUrl,
    preference: playerPreferenceForIptvChannel(channel),
    title: channel.name,
    ...(channel.logoUrl ? { thumbnailUrl: channel.logoUrl } : {}),
  })
}
