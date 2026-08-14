export type PlayerSourceKind = 'youtube' | 'hls' | 'direct'
export type DirectMediaType = 'video' | 'audio'
export type PlayerSourcePreference =
  'auto' | 'youtube' | 'hls' | 'direct-video' | 'direct-audio'

export type YouTubeChannelReference = {
  kind: 'handle' | 'channel' | 'user' | 'custom'
  value: string
  url: string
}

type BasePlayerSource = {
  originalUrl: string
  url: string
}

export type YouTubePlayerSource = BasePlayerSource & {
  kind: 'youtube'
  videoId: string
}

export type HlsPlayerSource = BasePlayerSource & {
  kind: 'hls'
}

export type DirectPlayerSource = BasePlayerSource & {
  kind: 'direct'
  mediaType: DirectMediaType
}

export type PlayerSource =
  YouTubePlayerSource | HlsPlayerSource | DirectPlayerSource

export type PlayerSourceErrorCode =
  | 'INVALID_URL'
  | 'UNSUPPORTED_SOURCE'
  | 'TORRENT_REQUIRES_P5'
  | 'NO_ACTIVE_SOURCE'

export class PlayerSourceError extends Error {
  readonly code: PlayerSourceErrorCode

  constructor(code: PlayerSourceErrorCode, message: string) {
    super(message)
    this.name = 'PlayerSourceError'
    this.code = code
  }
}

const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.flac',
  '.opus',
  '.oga',
])

function normalizeUrl(input: string) {
  const trimmed = input.trim()

  if (trimmed.toLowerCase().startsWith('magnet:')) {
    throw new PlayerSourceError(
      'TORRENT_REQUIRES_P5',
      'Magnet bağlantısını Torrent panelinden aç.',
    )
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new PlayerSourceError('INVALID_URL', 'Geçerli bir medya URL’si gir.')
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PlayerSourceError(
      'UNSUPPORTED_SOURCE',
      'Yalnız HTTP veya HTTPS medya kaynakları destekleniyor.',
    )
  }

  return { originalUrl: trimmed, url }
}

function sanitizeVideoId(value: string | null | undefined) {
  if (!value) return null
  const candidate = value.split(/[?&#/]/, 1)[0]?.trim() ?? ''
  return /^[A-Za-z0-9_-]{11}$/.test(candidate) ? candidate : null
}

export function parseYouTubeVideoId(input: string): string | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '')

  if (hostname === 'youtu.be') {
    return sanitizeVideoId(url.pathname.split('/').filter(Boolean)[0])
  }

  const youtubeHost =
    hostname === 'youtube.com' ||
    hostname === 'm.youtube.com' ||
    hostname === 'music.youtube.com' ||
    hostname === 'youtube-nocookie.com'

  if (!youtubeHost) return null

  if (url.pathname === '/watch') {
    return sanitizeVideoId(url.searchParams.get('v'))
  }

  const parts = url.pathname.split('/').filter(Boolean)
  if (parts[0] === 'shorts' || parts[0] === 'embed' || parts[0] === 'live') {
    return sanitizeVideoId(parts[1])
  }

  return null
}

export function parseYouTubeChannelReference(
  input: string,
): YouTubeChannelReference | null {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return null
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '')
  if (hostname !== 'youtube.com' && hostname !== 'm.youtube.com') return null

  const parts = url.pathname.split('/').filter(Boolean)
  const first = parts[0]
  if (!first) return null

  if (first.startsWith('@')) {
    return { kind: 'handle', value: first, url: url.toString() }
  }

  const map = {
    channel: 'channel',
    user: 'user',
    c: 'custom',
  } as const
  const kind = map[first as keyof typeof map]
  const value = parts[1]
  if (!kind || !value) return null

  return { kind, value, url: url.toString() }
}

function pathExtension(pathname: string) {
  const lastSegment = pathname.toLowerCase().split('/').pop() ?? ''
  const dotIndex = lastSegment.lastIndexOf('.')
  return dotIndex === -1 ? '' : lastSegment.slice(dotIndex)
}

export function classifyPlayerSource(
  input: string,
  preference: PlayerSourcePreference = 'auto',
): PlayerSource {
  const { originalUrl, url } = normalizeUrl(input)
  const videoId = parseYouTubeVideoId(url.toString())

  if (preference === 'youtube') {
    if (!videoId) {
      throw new PlayerSourceError(
        'UNSUPPORTED_SOURCE',
        'Bu adres geçerli bir YouTube video URL’si olarak tanınamadı.',
      )
    }

    return {
      kind: 'youtube',
      originalUrl,
      url: url.toString(),
      videoId,
    }
  }

  if (preference === 'hls') {
    return { kind: 'hls', originalUrl, url: url.toString() }
  }

  if (preference === 'direct-video' || preference === 'direct-audio') {
    return {
      kind: 'direct',
      mediaType: preference === 'direct-audio' ? 'audio' : 'video',
      originalUrl,
      url: url.toString(),
    }
  }

  if (videoId) {
    return {
      kind: 'youtube',
      originalUrl,
      url: url.toString(),
      videoId,
    }
  }

  const extension = pathExtension(url.pathname)
  if (extension === '.m3u8') {
    return { kind: 'hls', originalUrl, url: url.toString() }
  }

  if (AUDIO_EXTENSIONS.has(extension)) {
    return {
      kind: 'direct',
      mediaType: 'audio',
      originalUrl,
      url: url.toString(),
    }
  }

  return {
    kind: 'direct',
    mediaType: 'video',
    originalUrl,
    url: url.toString(),
  }
}
