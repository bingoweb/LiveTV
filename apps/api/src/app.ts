import Fastify from 'fastify'

import { createServiceHealth } from '@livetv/shared'

export function buildApi() {
  const app = Fastify()

  app.get('/api/health', async () => createServiceHealth('api'))

  return app
}
