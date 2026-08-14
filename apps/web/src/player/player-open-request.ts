import type { PlayerSourcePreference } from '@livetv/player-core'

import type { ParsedIptvChannel } from '../iptv/m3u-types'
import type { IptvChannel } from '../iptv/iptv-repository'
import { playerPreferenceForLibrarySource } from '../library/library-player-request'
import type { LibrarySource } from '../library/library-types'
import type { TorrentPlaybackDescriptor } from '../torrent/torrent-controller'
import type { TorrentReplayRequest } from '../torrent/torrent-replay'

export type PlayerOpenRequest = {
  id: number
  url: string
  preference: PlayerSourcePreference
  title?: string
  thumbnailUrl?: string
  channelUrl?: string
  librarySourceOverride?: LibrarySource
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
    ...('channelUrl' in source && source.channelUrl
      ? { channelUrl: source.channelUrl }
      : {}),
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

function absoluteTorrentStreamUrl(streamUrl: string, baseOrigin?: string) {
  try {
    return new URL(streamUrl).toString()
  } catch {
    const origin =
      baseOrigin ??
      (typeof globalThis.location !== 'undefined'
        ? globalThis.location.origin
        : undefined)
    if (!origin) {
      throw new Error(
        'WebTorrent stream URL’si için uygulama origin’i gerekiyor.',
      )
    }
    return new URL(streamUrl, origin).toString()
  }
}

export function playerRequestForTorrentPlayback(
  previousId: number,
  descriptor: TorrentPlaybackDescriptor,
  baseOrigin?: string,
): PlayerOpenRequest {
  return createPlayerOpenRequest(previousId, {
    url: absoluteTorrentStreamUrl(descriptor.streamUrl, baseOrigin),
    preference: descriptor.preference,
    title: descriptor.title,
    librarySourceOverride: descriptor.librarySource,
  })
}

export type LibraryPlaybackRequest =
  | { kind: 'player'; request: PlayerOpenRequest }
  | { kind: 'torrent'; request: TorrentReplayRequest }

export function playbackRequestForLibrarySource(
  previousPlayerId: number,
  previousTorrentReplayId: number,
  source: LibrarySource,
): LibraryPlaybackRequest {
  if (source.kind === 'torrent') {
    return {
      kind: 'torrent',
      request: {
        id: previousTorrentReplayId + 1,
        magnetUri: source.url,
        filePath: source.torrentFilePath,
      },
    }
  }

  return {
    kind: 'player',
    request: playerRequestForLibrarySource(previousPlayerId, source),
  }
}
