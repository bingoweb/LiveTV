import { createYouTubeDataApiClient } from './youtube-data-api.js'
import {
  normalizeYouTubeChannelLiveUrl,
  resolveYouTubeChannelLivePage,
} from './youtube-live.js'

export type YouTubeLiveDiscoveryMethod =
  'data-api' | 'live-page' | 'live-page-fallback'

type YouTubeLiveResolverOptions = {
  apiKey?: string
  fetchImpl?: typeof fetch
  now?: () => number
}

export function createYouTubeLiveResolver(
  options: YouTubeLiveResolverOptions = {},
) {
  const fetchImpl = options.fetchImpl ?? fetch
  const apiKey = options.apiKey?.trim()
  const dataApiClient = apiKey
    ? createYouTubeDataApiClient({
        apiKey,
        fetchImpl,
        ...(options.now ? { now: options.now } : {}),
      })
    : null

  return async (input: string, resolveOptions: { refresh?: boolean } = {}) => {
    const normalizedInput = input.trim().startsWith('@')
      ? `https://www.youtube.com/${input.trim()}`
      : input
    const liveUrl = normalizeYouTubeChannelLiveUrl(normalizedInput)

    if (dataApiClient) {
      try {
        const resolution = await dataApiClient.resolveChannelLive(
          input,
          resolveOptions,
        )

        return {
          ...resolution,
          liveUrl,
          discoveryMethod: 'data-api' as const,
          officialApiAvailable: true,
        }
      } catch (error) {
        const warning =
          error instanceof Error
            ? error.message
            : 'YouTube Data API isteği başarısız.'
        const resolution = await resolveYouTubeChannelLivePage(
          normalizedInput,
          fetchImpl,
        )

        return {
          ...resolution,
          discoveryMethod: 'live-page-fallback' as const,
          officialApiAvailable: true,
          warning,
        }
      }
    }

    const resolution = await resolveYouTubeChannelLivePage(
      normalizedInput,
      fetchImpl,
    )

    return {
      ...resolution,
      discoveryMethod: 'live-page' as const,
      officialApiAvailable: false,
    }
  }
}
