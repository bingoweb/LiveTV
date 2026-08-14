import type {
  TorrentFileDescriptor,
  TorrentLibrarySource,
  TorrentMediaType,
} from './torrent-types'

export { TORRENT_FILE_MAX_BYTES } from './torrent-types'

const VIDEO_EXTENSIONS = new Set(['mp4', 'm4v', 'mov', 'webm', 'ogv', 'mkv'])
const AUDIO_EXTENSIONS = new Set([
  'mp3',
  'm4a',
  'aac',
  'wav',
  'flac',
  'opus',
  'oga',
])

function extension(name: string) {
  const clean = name.split(/[?#]/, 1)[0] ?? ''
  const dot = clean.lastIndexOf('.')
  return dot === -1 ? '' : clean.slice(dot + 1).toLowerCase()
}

export function validateTorrentTextSource(input: string) {
  const value = input.trim()
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Geçerli bir magnet veya HTTP(S) .torrent adresi gir.')
  }

  if (url.protocol === 'magnet:') {
    const hasInfoHash = url.searchParams
      .getAll('xt')
      .some((item) => item.toLowerCase().startsWith('urn:btih:'))
    if (!hasInfoHash) {
      throw new Error('Magnet bağlantısında BitTorrent info hash bulunamadı.')
    }
    return value
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Torrent kaynağı magnet veya HTTP(S) olmalı.')
  }
  if (!url.pathname.toLowerCase().endsWith('.torrent')) {
    throw new Error('HTTP(S) torrent adresi .torrent dosyasını göstermeli.')
  }
  return url.toString()
}

export function classifyTorrentMediaFile(input: {
  name: string
  type?: string
}): TorrentMediaType {
  const type = input.type?.toLowerCase() ?? ''
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'

  const ext = extension(input.name)
  if (VIDEO_EXTENSIONS.has(ext)) return 'video'
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio'
  if (ext === 'ogg') return 'audio'
  return 'unsupported'
}

export function choosePreferredTorrentFile(
  files: readonly TorrentFileDescriptor[],
  preferredPath?: string,
) {
  const playable = files.filter(({ mediaType }) => mediaType !== 'unsupported')
  if (preferredPath) {
    const preferred = playable.find(({ path }) => path === preferredPath)
    if (preferred) return preferred
  }
  return playable.length === 1 ? playable[0]! : null
}

export function torrentSourceKey(infoHash: string, filePath: string) {
  return `torrent:${infoHash.trim().toLowerCase()}:${encodeURIComponent(filePath)}`
}

export function createTorrentLibrarySource(input: {
  infoHash: string
  magnetUri: string
  filePath: string
  fileName: string
  mediaType: 'video' | 'audio'
}): TorrentLibrarySource {
  const magnetUri = validateTorrentTextSource(input.magnetUri)
  if (!magnetUri.toLowerCase().startsWith('magnet:')) {
    throw new Error('Kalıcı torrent kaynağı canonical magnet URI kullanmalı.')
  }
  return {
    sourceKey: torrentSourceKey(input.infoHash, input.filePath),
    kind: 'torrent',
    url: magnetUri,
    title: input.fileName,
    torrentFilePath: input.filePath,
    torrentMediaType: input.mediaType,
  }
}
