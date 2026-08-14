import { createServer, type Server } from 'node:http'
import { gzipSync } from 'node:zlib'

import { afterEach, describe, expect, it } from 'vitest'

import { fetchPublicHttpText, isPublicIpAddress } from '../src/public-http-text'

const servers: Server[] = []

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  )
})

async function listen(
  handler: Parameters<typeof createServer>[0],
): Promise<{ url: string; port: number }> {
  const server = createServer(handler)
  servers.push(server)
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('port missing')
  return { url: `http://fixture.test:${address.port}`, port: address.port }
}

const LOCAL_LOOKUP = async () => [{ address: '127.0.0.1', family: 4 as const }]

describe('public HTTP text fetch', () => {
  it('classifies common public/private IPv4 and IPv6 addresses', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true)
    expect(isPublicIpAddress('127.0.0.1')).toBe(false)
    expect(isPublicIpAddress('10.0.0.1')).toBe(false)
    expect(isPublicIpAddress('192.168.1.1')).toBe(false)
    expect(isPublicIpAddress('169.254.2.3')).toBe(false)
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true)
    expect(isPublicIpAddress('::1')).toBe(false)
    expect(isPublicIpAddress('fc00::1')).toBe(false)
    expect(isPublicIpAddress('fe80::1')).toBe(false)
    expect(isPublicIpAddress('ff02::1')).toBe(false)
  })

  it('rejects a private DNS target unless its exact host is allowlisted', async () => {
    await expect(
      fetchPublicHttpText('http://fixture.test:9000/a.xml', {
        maxBytes: 1000,
        timeoutMs: 100,
        lookupImpl: LOCAL_LOOKUP,
      }),
    ).rejects.toMatchObject({ code: 'unsafe-url' })
  })

  it('allows only the exact configured private host and reads a bounded body', async () => {
    const fixture = await listen((_request, response) => {
      response.setHeader('content-type', 'application/xml')
      response.end('<tv/>')
    })

    const result = await fetchPublicHttpText(`${fixture.url}/guide.xml`, {
      maxBytes: 1000,
      timeoutMs: 1000,
      allowedPrivateHosts: new Set(['fixture.test']),
      lookupImpl: LOCAL_LOOKUP,
    })

    expect(result).toEqual({
      finalUrl: `${fixture.url}/guide.xml`,
      text: '<tv/>',
      contentType: 'application/xml',
    })
  })

  it('revalidates redirect targets instead of inheriting the first host allowlist', async () => {
    const fixture = await listen((_request, response) => {
      response.statusCode = 302
      response.setHeader('location', `http://127.0.0.1:1/private.xml`)
      response.end()
    })

    await expect(
      fetchPublicHttpText(`${fixture.url}/redirect`, {
        maxBytes: 1000,
        timeoutMs: 1000,
        allowedPrivateHosts: new Set(['fixture.test']),
        lookupImpl: LOCAL_LOOKUP,
      }),
    ).rejects.toMatchObject({ code: 'unsafe-url' })
  })

  it('enforces redirect, timeout, and response size limits', async () => {
    const fixture = await listen((request, response) => {
      if (request.url === '/loop') {
        response.statusCode = 302
        response.setHeader('location', `${fixture.url}/loop`)
        response.end()
        return
      }
      if (request.url === '/slow') {
        setTimeout(() => response.end('late'), 80)
        return
      }
      response.end('0123456789')
    })
    const base = {
      lookupImpl: LOCAL_LOOKUP,
      allowedPrivateHosts: new Set(['fixture.test']),
    }

    await expect(
      fetchPublicHttpText(`${fixture.url}/loop`, {
        ...base,
        maxBytes: 100,
        timeoutMs: 1000,
        maxRedirects: 1,
      }),
    ).rejects.toMatchObject({ code: 'redirect-limit' })

    await expect(
      fetchPublicHttpText(`${fixture.url}/slow`, {
        ...base,
        maxBytes: 100,
        timeoutMs: 20,
      }),
    ).rejects.toMatchObject({ code: 'timeout' })

    await expect(
      fetchPublicHttpText(`${fixture.url}/large`, {
        ...base,
        maxBytes: 5,
        timeoutMs: 1000,
      }),
    ).rejects.toMatchObject({ code: 'response-too-large' })
  })

  it('normalizes gzip responses and does not forward cookies', async () => {
    let cookie: string | undefined
    const fixture = await listen((request, response) => {
      cookie = request.headers.cookie
      const body = gzipSync(Buffer.from('<tv><channel id="a"/></tv>'))
      response.setHeader('content-encoding', 'gzip')
      response.setHeader('content-type', 'application/xml')
      response.end(body)
    })

    const result = await fetchPublicHttpText(`${fixture.url}/guide.xml.gz`, {
      maxBytes: 1000,
      timeoutMs: 1000,
      acceptGzip: true,
      allowedPrivateHosts: new Set(['fixture.test']),
      lookupImpl: LOCAL_LOOKUP,
    })

    expect(result.text).toContain('<channel id="a"/>')
    expect(cookie).toBeUndefined()
  })

  it('rejects unsupported protocols before DNS or network activity', async () => {
    await expect(
      fetchPublicHttpText('file:///etc/passwd', {
        maxBytes: 100,
        timeoutMs: 100,
      }),
    ).rejects.toMatchObject({ code: 'invalid-url' })
  })
})
