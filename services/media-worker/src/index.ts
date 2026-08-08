import { buildMediaWorker } from './app.js'

const port = Number.parseInt(
  process.env.MEDIA_WORKER_PORT ?? process.env.PORT ?? '3002',
  10,
)
const app = buildMediaWorker()

await app.listen({
  host: '0.0.0.0',
  port,
})
