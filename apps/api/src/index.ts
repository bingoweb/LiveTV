import { buildApi } from './app.js'

const port = Number.parseInt(
  process.env.API_PORT ?? process.env.PORT ?? '3001',
  10,
)
const app = buildApi()

await app.listen({
  host: '0.0.0.0',
  port,
})
