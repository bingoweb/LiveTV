import Fastify from 'fastify'

import { createServiceHealth } from '@livetv/shared'

export function buildMediaWorker() {
  const app = Fastify()

  app.get('/media/health', async () => createServiceHealth('media-worker'))

  return app
}
