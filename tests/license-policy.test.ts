import { describe, expect, it } from 'vitest'

import {
  collectManifestDependencyNames,
  isAllowedLicense,
} from '../scripts/license-policy.mjs'

describe('license policy', () => {
  it('accepts the approved open-source license set and SPDX alternatives', () => {
    expect(isAllowedLicense('MIT')).toBe(true)
    expect(isAllowedLicense('Apache-2.0')).toBe(true)
    expect(isAllowedLicense('MIT OR Apache-2.0')).toBe(true)
  })

  it('rejects unknown and unapproved license metadata', () => {
    expect(isAllowedLicense(undefined)).toBe(false)
    expect(isAllowedLicense('UNLICENSED')).toBe(false)
    expect(isAllowedLicense('Proprietary')).toBe(false)
  })

  it('collects direct external dependencies once and skips LiveTV workspaces', () => {
    expect(
      collectManifestDependencyNames([
        {
          dependencies: {
            fastify: '^5.0.0',
            '@livetv/shared': '0.0.0',
          },
          devDependencies: {
            vitest: '^4.0.0',
          },
        },
        {
          dependencies: {
            fastify: '^5.0.0',
            react: '^19.0.0',
          },
        },
      ]),
    ).toEqual(['fastify', 'react', 'vitest'])
  })
})
