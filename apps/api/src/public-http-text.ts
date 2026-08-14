import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { isIP, type LookupFunction } from 'node:net'
import { createGunzip } from 'node:zlib'

export type PublicHttpTextErrorCode =
  | 'invalid-url'
  | 'unsafe-url'
  | 'redirect-limit'
  | 'timeout'
  | 'response-too-large'
  | 'http-error'
  | 'network-error'
  | 'unsupported-encoding'

export class PublicHttpTextError extends Error {
  constructor(
    public readonly code: PublicHttpTextErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'PublicHttpTextError'
  }
}

export type PublicLookupAddress = {
  address: string
  family: 4 | 6
}

export type PublicLookup = (hostname: string) => Promise<PublicLookupAddress[]>

export type PublicHttpTextOptions = {
  maxBytes: number
  timeoutMs: number
  maxRedirects?: number
  acceptGzip?: boolean
  allowedPrivateHosts?: ReadonlySet<string>
  lookupImpl?: PublicLookup
}

export type PublicHttpTextResult = {
  finalUrl: string
  text: string
  contentType?: string
}

function ipv4Number(address: string) {
  const parts = address.split('.').map(Number)
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return null
  }
  return (
    ((((parts[0] ?? 0) << 24) >>> 0) +
      ((parts[1] ?? 0) << 16) +
      ((parts[2] ?? 0) << 8) +
      (parts[3] ?? 0)) >>>
    0
  )
}

function inV4Range(value: number, network: number, prefix: number) {
  if (prefix === 0) return true
  const mask = (0xffffffff << (32 - prefix)) >>> 0
  return (value & mask) === (network & mask)
}

function isPublicIpv4(address: string) {
  const value = ipv4Number(address)
  if (value === null) return false
  const blocked: Array<[string, number]> = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
  ]
  return !blocked.some(([network, prefix]) => {
    const networkValue = ipv4Number(network)
    return networkValue !== null && inV4Range(value, networkValue, prefix)
  })
}

function isPublicIpv6(address: string) {
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized === '::1') return false
  if (normalized.startsWith('::ffff:')) return false

  const firstText = normalized.split(':')[0]
  const first = Number.parseInt(firstText || '0', 16)
  if (!Number.isFinite(first)) return false
  if ((first & 0xfe00) === 0xfc00) return false // fc00::/7
  if ((first & 0xffc0) === 0xfe80) return false // fe80::/10
  if ((first & 0xff00) === 0xff00) return false // multicast
  if (normalized.startsWith('2001:db8:') || normalized === '2001:db8::') {
    return false
  }
  return first >= 0x2000 && first <= 0x3fff
}

export function isPublicIpAddress(address: string) {
  const family = isIP(address)
  if (family === 4) return isPublicIpv4(address)
  if (family === 6) return isPublicIpv6(address)
  return false
}

function normalizedHost(value: string) {
  return value
    .replace(/^\[|\]$/g, '')
    .trim()
    .toLowerCase()
}

async function defaultLookup(hostname: string) {
  return await dnsLookup(hostname, { all: true, verbatim: true })
}

async function validateTarget(
  url: URL,
  options: PublicHttpTextOptions,
): Promise<PublicLookupAddress> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new PublicHttpTextError(
      'invalid-url',
      'Yalnız HTTP veya HTTPS adresleri destekleniyor.',
    )
  }

  const host = normalizedHost(url.hostname)
  const allowedPrivate = options.allowedPrivateHosts?.has(host) ?? false
  const family = isIP(host)
  if (family !== 0) {
    if (!allowedPrivate && !isPublicIpAddress(host)) {
      throw new PublicHttpTextError('unsafe-url', 'Özel ağ adresi reddedildi.')
    }
    return { address: host, family: family as 4 | 6 }
  }

  let addresses: PublicLookupAddress[]
  try {
    addresses = (await (options.lookupImpl ?? defaultLookup)(host)).map(
      ({ address, family }) => ({
        address,
        family: family === 6 ? 6 : 4,
      }),
    )
  } catch (error) {
    throw new PublicHttpTextError('network-error', 'DNS çözümleme başarısız.', {
      cause: error,
    })
  }
  if (addresses.length === 0) {
    throw new PublicHttpTextError('network-error', 'DNS adres döndürmedi.')
  }
  if (
    !allowedPrivate &&
    addresses.some(({ address }) => !isPublicIpAddress(address))
  ) {
    throw new PublicHttpTextError(
      'unsafe-url',
      'DNS özel ağ adresine çözümlendi.',
    )
  }
  const selected = addresses[0]
  if (!selected) {
    throw new PublicHttpTextError('network-error', 'DNS adres döndürmedi.')
  }
  return selected
}

function collectStream(
  stream: NodeJS.ReadableStream,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    stream.on('data', (chunk: Buffer | Uint8Array | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > maxBytes) {
        reject(
          new PublicHttpTextError(
            'response-too-large',
            'Uzak yanıt izin verilen boyutu aşıyor.',
          ),
        )
        if ('destroy' in stream && typeof stream.destroy === 'function') {
          stream.destroy()
        }
        return
      }
      chunks.push(buffer)
    })
    stream.once('error', (error) => reject(error))
    stream.once('end', () => resolve(Buffer.concat(chunks)))
  })
}

async function responseBody(
  response: IncomingMessage,
  options: PublicHttpTextOptions,
) {
  const encoding = response.headers['content-encoding']?.toLowerCase().trim()
  if (!encoding || encoding === 'identity') {
    return await collectStream(response, options.maxBytes)
  }
  if (encoding !== 'gzip' || options.acceptGzip === false) {
    throw new PublicHttpTextError(
      'unsupported-encoding',
      `Desteklenmeyen içerik sıkıştırması: ${encoding}`,
    )
  }

  let wireBytes = 0
  const gunzip = createGunzip()
  response.on('data', (chunk: Buffer | Uint8Array | string) => {
    wireBytes += Buffer.byteLength(chunk)
    if (wireBytes > options.maxBytes) {
      response.destroy(
        new PublicHttpTextError(
          'response-too-large',
          'Sıkıştırılmış uzak yanıt izin verilen boyutu aşıyor.',
        ),
      )
    }
  })
  response.pipe(gunzip)
  try {
    return await collectStream(gunzip, options.maxBytes)
  } catch (error) {
    if (error instanceof PublicHttpTextError) throw error
    throw new PublicHttpTextError('network-error', 'Gzip açılamadı.', {
      cause: error,
    })
  }
}

function isRedirect(statusCode: number | undefined) {
  return (
    statusCode === 301 ||
    statusCode === 302 ||
    statusCode === 303 ||
    statusCode === 307 ||
    statusCode === 308
  )
}

async function fetchOnce(
  input: string,
  options: PublicHttpTextOptions,
  redirectsLeft: number,
): Promise<PublicHttpTextResult> {
  let url: URL
  try {
    url = new URL(input)
  } catch (error) {
    throw new PublicHttpTextError('invalid-url', 'Geçersiz uzak URL.', {
      cause: error,
    })
  }
  const resolved = await validateTarget(url, options)
  const requestImpl = url.protocol === 'https:' ? httpsRequest : httpRequest
  const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all) {
      callback(null, [resolved])
      return
    }
    callback(null, resolved.address, resolved.family)
  }

  return await new Promise<PublicHttpTextResult>((resolve, reject) => {
    const request = requestImpl(
      url,
      {
        method: 'GET',
        headers: {
          accept: 'application/xml,text/xml,text/plain,*/*;q=0.1',
          ...(options.acceptGzip === false
            ? {}
            : { 'accept-encoding': 'gzip, identity' }),
        },
        lookup: pinnedLookup,
      },
      (response) => {
        void (async () => {
          if (isRedirect(response.statusCode)) {
            response.resume()
            const location = response.headers.location
            if (!location) {
              reject(
                new PublicHttpTextError(
                  'http-error',
                  'Yönlendirme adresi eksik.',
                ),
              )
              return
            }
            if (redirectsLeft <= 0) {
              reject(
                new PublicHttpTextError(
                  'redirect-limit',
                  'Uzak URL çok fazla yönlendirme yaptı.',
                ),
              )
              return
            }
            try {
              resolve(
                await fetchOnce(
                  new URL(location, url).toString(),
                  options,
                  redirectsLeft - 1,
                ),
              )
            } catch (error) {
              reject(error)
            }
            return
          }

          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            response.resume()
            reject(
              new PublicHttpTextError(
                'http-error',
                `Uzak sunucu HTTP ${response.statusCode ?? 0} döndürdü.`,
              ),
            )
            return
          }

          try {
            const body = await responseBody(response, options)
            const contentType = response.headers['content-type']
            resolve({
              finalUrl: url.toString(),
              text: new TextDecoder().decode(body),
              ...(contentType ? { contentType } : {}),
            })
          } catch (error) {
            reject(error)
          }
        })()
      },
    )

    request.setTimeout(options.timeoutMs, () => {
      request.destroy(
        new PublicHttpTextError('timeout', 'Uzak sunucu zaman aşımına uğradı.'),
      )
    })
    request.once('error', (error) => {
      reject(
        error instanceof PublicHttpTextError
          ? error
          : new PublicHttpTextError('network-error', 'Uzak istek başarısız.', {
              cause: error,
            }),
      )
    })
    request.end()
  })
}

export async function fetchPublicHttpText(
  input: string,
  options: PublicHttpTextOptions,
) {
  return await fetchOnce(input, options, options.maxRedirects ?? 3)
}
