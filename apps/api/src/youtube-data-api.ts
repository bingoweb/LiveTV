export type YouTubeDataApiResolution =
  | {
      status: 'live'
      channelId: string
      videoId: string
      videoUrl: string
      title?: string
      thumbnailUrl?: string
      actualStartTime?: string
      concurrentViewers?: string
    }
  | { status: 'offline'; channelId: string }

export type YouTubeDataApiClient = {
  resolveChannelLive(
    input: string,
    options?: { refresh?: boolean },
  ): Promise<YouTubeDataApiResolution>
}

type YouTubeDataApiClientOptions = {
  apiKey: string
  fetchImpl?: typeof fetch
  now?: () => number
}

type YouTubeChannelsResponse = {
  items?: Array<{ id?: string }>
}

type YouTubeSearchResponse = {
  items?: Array<{ id?: { videoId?: string } }>
}

type YouTubeVideosResponse = {
  items?: Array<{
    id?: string
    snippet?: {
      title?: string
      thumbnails?: Record<string, { url?: string } | undefined>
    }
    status?: { embeddable?: boolean }
    liveStreamingDetails?: {
      actualStartTime?: string
      actualEndTime?: string
      concurrentViewers?: string
    }
  }>
}

const DATA_API_BASE = 'https://www.googleapis.com/youtube/v3'
const CHANNEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const LIVE_CACHE_TTL_MS = 25_000
const OFFLINE_CACHE_TTL_MS = 15_000

type YouTubeChannelReference =
  { kind: 'handle'; handle: string } | { kind: 'channel-id'; channelId: string }

function parseChannelReference(input: string): YouTubeChannelReference {
  const trimmed = input.trim()
  if (/^@[A-Za-z0-9._-]+$/.test(trimmed)) {
    return { kind: 'handle', handle: trimmed }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    throw new Error('Geçerli bir YouTube kanal adresi gir.')
  }

  const hostname = url.hostname.toLowerCase()
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(hostname)) {
    throw new Error('Bu çözümleyici yalnız YouTube kanal adresleri içindir.')
  }

  const parts = url.pathname.split('/').filter(Boolean)
  const first = parts[0]
  if (first?.startsWith('@')) {
    return { kind: 'handle', handle: first }
  }

  if (first === 'channel' && parts[1]) {
    return { kind: 'channel-id', channelId: parts[1] }
  }

  throw new Error('YouTube kanal veya @handle adresi bekleniyor.')
}

function buildDataApiUrl(path: string, params: Record<string, string>) {
  const url = new URL(`${DATA_API_BASE}/${path}`)
  Object.entries(params).forEach(([key, value]) =>
    url.searchParams.set(key, value),
  )
  return url
}

async function requestJson<T>(url: URL, fetchImpl: typeof fetch): Promise<T> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(12_000),
    headers: { accept: 'application/json' },
  })

  if (!response.ok) {
    const errorPayload = (await response.json().catch(() => null)) as {
      error?: { message?: string }
    } | null
    const detail = errorPayload?.error?.message?.trim()
    throw new Error(
      detail
        ? `YouTube Data API isteği başarısız (${response.status}): ${detail}`
        : `YouTube Data API isteği başarısız (${response.status}).`,
    )
  }

  return (await response.json()) as T
}

export function createYouTubeDataApiClient(
  options: YouTubeDataApiClientOptions,
): YouTubeDataApiClient {
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const channelIdCache = new Map<
    string,
    { channelId: string; expiresAt: number }
  >()
  const liveCache = new Map<
    string,
    { resolution: YouTubeDataApiResolution; expiresAt: number }
  >()

  return {
    async resolveChannelLive(input, resolveOptions = {}) {
      const reference = parseChannelReference(input)
      const timestamp = now()
      const cachedChannel =
        reference.kind === 'handle'
          ? channelIdCache.get(reference.handle)
          : undefined
      let channelId =
        reference.kind === 'channel-id'
          ? reference.channelId
          : cachedChannel && cachedChannel.expiresAt > timestamp
            ? cachedChannel.channelId
            : undefined

      if (!channelId) {
        const channelsUrl = buildDataApiUrl('channels', {
          part: 'id,snippet',
          forHandle: reference.kind === 'handle' ? reference.handle : '',
          key: options.apiKey,
        })
        const channels = await requestJson<YouTubeChannelsResponse>(
          channelsUrl,
          fetchImpl,
        )
        channelId = channels.items?.[0]?.id
        if (!channelId) {
          const label =
            reference.kind === 'handle' ? reference.handle : reference.channelId
          throw new Error(`YouTube kanalı bulunamadı: ${label}`)
        }

        if (reference.kind === 'handle') {
          channelIdCache.set(reference.handle, {
            channelId,
            expiresAt: timestamp + CHANNEL_CACHE_TTL_MS,
          })
        }
      }

      if (!resolveOptions.refresh) {
        const cachedLive = liveCache.get(channelId)
        if (cachedLive && cachedLive.expiresAt > timestamp) {
          return cachedLive.resolution
        }
      }

      const searchUrl = buildDataApiUrl('search', {
        part: 'snippet',
        channelId,
        type: 'video',
        eventType: 'live',
        videoEmbeddable: 'true',
        maxResults: '10',
        key: options.apiKey,
      })
      const search = await requestJson<YouTubeSearchResponse>(
        searchUrl,
        fetchImpl,
      )

      const videoId = search.items?.[0]?.id?.videoId
      if (!videoId) {
        const resolution: YouTubeDataApiResolution = {
          status: 'offline',
          channelId,
        }
        liveCache.set(channelId, {
          resolution,
          expiresAt: timestamp + OFFLINE_CACHE_TTL_MS,
        })
        return resolution
      }

      const videosUrl = buildDataApiUrl('videos', {
        part: 'snippet,liveStreamingDetails,status',
        id: videoId,
        key: options.apiKey,
      })
      const videos = await requestJson<YouTubeVideosResponse>(
        videosUrl,
        fetchImpl,
      )
      const video = videos.items?.find((item) => item.id === videoId)
      if (!video || video.liveStreamingDetails?.actualEndTime) {
        const resolution: YouTubeDataApiResolution = {
          status: 'offline',
          channelId,
        }
        liveCache.set(channelId, {
          resolution,
          expiresAt: timestamp + OFFLINE_CACHE_TTL_MS,
        })
        return resolution
      }

      const thumbnailUrl =
        video.snippet?.thumbnails?.maxres?.url ??
        video.snippet?.thumbnails?.standard?.url ??
        video.snippet?.thumbnails?.high?.url ??
        video.snippet?.thumbnails?.medium?.url ??
        video.snippet?.thumbnails?.default?.url

      const resolution: YouTubeDataApiResolution = {
        status: 'live',
        channelId,
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        ...(video.snippet?.title ? { title: video.snippet.title } : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(video.liveStreamingDetails?.actualStartTime
          ? { actualStartTime: video.liveStreamingDetails.actualStartTime }
          : {}),
        ...(video.liveStreamingDetails?.concurrentViewers
          ? { concurrentViewers: video.liveStreamingDetails.concurrentViewers }
          : {}),
      }
      liveCache.set(channelId, {
        resolution,
        expiresAt: timestamp + LIVE_CACHE_TTL_MS,
      })
      return resolution
    },
  }
}
