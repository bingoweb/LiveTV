export const TORRENT_FILE_MAX_BYTES = 5 * 1024 * 1024

export type TorrentMediaType = 'video' | 'audio' | 'unsupported'

export type TorrentFileDescriptor = {
  path: string
  name: string
  size: number
  type: string
  mediaType: TorrentMediaType
  progress: number
  streamUrl?: string
}

export type TorrentLibrarySource = {
  sourceKey: string
  kind: 'torrent'
  url: string
  title: string
  torrentFilePath: string
  torrentMediaType: 'video' | 'audio'
  thumbnailUrl?: string
}
