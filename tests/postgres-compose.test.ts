import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('PostgreSQL 18 Compose storage', () => {
  it('mounts the named volume at the PostgreSQL 18 parent data directory', () => {
    const compose = readFileSync('compose.yaml', 'utf8')

    expect(compose).toContain('postgres-data:/var/lib/postgresql')
    expect(compose).not.toContain('postgres-data:/var/lib/postgresql/data')
  })

  it('passes the optional YouTube Data API key only to the API service', () => {
    const compose = readFileSync('compose.yaml', 'utf8')
    const webSection = compose.split('\n  web:')[1]?.split('\n  api:')[0] ?? ''
    const apiSection =
      compose.split('\n  api:')[1]?.split('\n  media-worker:')[0] ?? ''

    expect(apiSection).toContain(
      'YOUTUBE_DATA_API_KEY: ${YOUTUBE_DATA_API_KEY:-}',
    )
    expect(webSection).not.toContain('YOUTUBE_DATA_API_KEY')
  })

  it('passes the optional EPG private-host allowlist only to the API service', () => {
    const compose = readFileSync('compose.yaml', 'utf8')
    const envExample = readFileSync('.env.example', 'utf8')
    const webSection = compose.split('\n  web:')[1]?.split('\n  api:')[0] ?? ''
    const apiSection =
      compose.split('\n  api:')[1]?.split('\n  media-worker:')[0] ?? ''

    expect(envExample).toContain('EPG_FETCH_ALLOWED_PRIVATE_HOSTS=')
    expect(apiSection).toContain(
      'EPG_FETCH_ALLOWED_PRIVATE_HOSTS: ${EPG_FETCH_ALLOWED_PRIVATE_HOSTS:-}',
    )
    expect(webSection).not.toContain('EPG_FETCH_ALLOWED_PRIVATE_HOSTS')
    expect(compose).not.toContain('VITE_EPG_FETCH_ALLOWED_PRIVATE_HOSTS')
  })
})
