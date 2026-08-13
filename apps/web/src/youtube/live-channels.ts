export type FeaturedYouTubeChannel = {
  name: string
  handle: string
  url: string
}

export type LiveChannelStatus =
  | {
      channel: FeaturedYouTubeChannel
      status: 'live'
      videoId: string
      videoUrl: string
      title?: string
      thumbnailUrl?: string
    }
  | {
      channel: FeaturedYouTubeChannel
      status: 'offline'
    }
  | {
      channel: FeaturedYouTubeChannel
      status: 'error'
      message: string
    }

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

type LiveResolverPayload = {
  status?: 'live' | 'offline'
  videoId?: string
  videoUrl?: string
  title?: string
  thumbnailUrl?: string
  message?: string
}

export const featuredYouTubeChannels: readonly FeaturedYouTubeChannel[] = [
  {
    name: 'Halk TV',
    handle: '@Halktvkanali',
    url: 'https://www.youtube.com/@Halktvkanali',
  },
  {
    name: 'ANKA Haber',
    handle: '@ankahaberajans',
    url: 'https://www.youtube.com/@ankahaberajans',
  },
] as const

async function loadOneChannel(
  channel: FeaturedYouTubeChannel,
  fetchImpl: FetchLike,
): Promise<LiveChannelStatus> {
  try {
    const response = await fetchImpl(
      `/api/youtube/resolve-live?url=${encodeURIComponent(channel.url)}`,
    )
    const payload = (await response
      .json()
      .catch(() => ({}))) as LiveResolverPayload

    if (!response.ok) {
      return {
        channel,
        status: 'error',
        message: payload.message ?? `HTTP ${response.status}`,
      }
    }

    if (
      payload.status === 'live' &&
      typeof payload.videoId === 'string' &&
      typeof payload.videoUrl === 'string'
    ) {
      return {
        channel,
        status: 'live',
        videoId: payload.videoId,
        videoUrl: payload.videoUrl,
        ...(payload.title ? { title: payload.title } : {}),
        ...(payload.thumbnailUrl ? { thumbnailUrl: payload.thumbnailUrl } : {}),
      }
    }

    return { channel, status: 'offline' }
  } catch (error) {
    return {
      channel,
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Canlı durum alınamadı.',
    }
  }
}

export function loadFeaturedLiveStatuses(
  fetchImpl: FetchLike = fetch,
): Promise<LiveChannelStatus[]> {
  return Promise.all(
    featuredYouTubeChannels.map((channel) =>
      loadOneChannel(channel, fetchImpl),
    ),
  )
}
