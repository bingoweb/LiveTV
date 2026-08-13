import Fastify from 'fastify'

import { createServiceHealth } from '@livetv/shared'
import { resolveYouTubeChannelLive } from './youtube-live.js'

type BuildApiOptions = {
  fetchImpl?: typeof fetch
}

export function buildApi(options: BuildApiOptions = {}) {
  const app = Fastify()

  app.get('/api/health', async () => createServiceHealth('api'))

  app.get<{ Querystring: { url?: string } }>(
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
        return await resolveYouTubeChannelLive(
          input,
          options.fetchImpl ?? fetch,
        )
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
