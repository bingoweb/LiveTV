import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('PostgreSQL 18 Compose storage', () => {
  it('mounts the named volume at the PostgreSQL 18 parent data directory', () => {
    const compose = readFileSync('compose.yaml', 'utf8')

    expect(compose).toContain('postgres-data:/var/lib/postgresql')
    expect(compose).not.toContain('postgres-data:/var/lib/postgresql/data')
  })
})
