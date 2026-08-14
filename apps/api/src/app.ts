import Fastify from 'fastify'

import { createServiceHealth } from '@livetv/shared'
import {
  EpgFallbackError,
  fetchVerifiedEpg,
  parseAllowedPrivateHosts,
  type FetchVerifiedEpgInput,
} from './epg-fallback.js'
import { createYouTubeLiveResolver } from './youtube-live-service.js'

type BuildApiOptions = {
  fetchImpl?: typeof fetch
  youtubeApiKey?: string
  now?: () => number
  epgFetcher?: (input: FetchVerifiedEpgInput) => Promise<{
    xml: string
    epgUrl: string
  }>
  epgAllowedPrivateHosts?: ReadonlySet<string>
}

export function buildApi(options: BuildApiOptions = {}) {
  const app = Fastify()
  const resolveYouTubeChannelLive = createYouTubeLiveResolver({
    apiKey: options.youtubeApiKey ?? process.env.YOUTUBE_DATA_API_KEY,
    fetchImpl: options.fetchImpl ?? fetch,
    ...(options.now ? { now: options.now } : {}),
  })
  const allowedPrivateHosts =
    options.epgAllowedPrivateHosts ??
    parseAllowedPrivateHosts(process.env.EPG_FETCH_ALLOWED_PRIVATE_HOSTS)
  const resolveEpg =
    options.epgFetcher ??
    ((input: FetchVerifiedEpgInput) =>
      fetchVerifiedEpg(input, { allowedPrivateHosts }))

  app.get('/api/health', async () => createServiceHealth('api'))

  app.post<{
    Body: { playlistUrl?: string; epgUrl?: string }
  }>('/api/epg/fetch', async (request, reply) => {
    const playlistUrl = request.body?.playlistUrl?.trim()
    const epgUrl = request.body?.epgUrl?.trim()
    if (!playlistUrl || !epgUrl) {
      return reply.code(400).send({
        error: 'invalid_epg_request',
        message: 'Playlist ve EPG URL’leri gerekli.',
      })
    }

    try {
      const result = await resolveEpg({ playlistUrl, epgUrl })
      return reply.type('application/xml; charset=utf-8').send(result.xml)
    } catch (error) {
      if (error instanceof EpgFallbackError) {
        return reply.code(error.statusCode).send({
          error: error.code,
          message: error.message,
        })
      }
      return reply.code(502).send({
        error: 'epg_fetch_failed',
        message: 'XMLTV fallback isteği başarısız.',
      })
    }
  })

  app.get<{ Querystring: { url?: string; refresh?: string } }>(
    '/api/youtube/resolve-live',
    async (request, reply) => {
      const input = request.query.url?.trim()
      if (!input) {
        return reply.code(400).send({
          error: 'youtube_channel_url_required',
          message: 'YouTube kanal URL’si gerekli.',
        })
      }

      try {
        return await resolveYouTubeChannelLive(input, {
          refresh: request.query.refresh === '1',
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Canlı yayın çözümlenemedi.'
        const clientError =
          message.includes('kanal') || message.includes('YouTube kanal')

        return reply.code(clientError ? 400 : 502).send({
          error: clientError
            ? 'invalid_youtube_channel_url'
            : 'youtube_live_resolution_failed',
          message,
        })
      }
    },
  )

  return app
}
