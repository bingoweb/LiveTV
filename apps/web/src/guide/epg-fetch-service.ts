import { parseXmltv, type ParsedXmltv } from '@livetv/shared'

import type { IptvList } from '../iptv/iptv-repository'
import {
  decodeXmltvBytes,
  readResponseBytes,
  XMLTV_MAX_BYTES,
  XmltvPayloadError,
  type XmltvDecompressionStreamFactory,
} from './xmltv-payload'

const XMLTV_FETCH_TIMEOUT_MS = 20_000

export type EpgFetchResult = {
  mode: 'url' | 'file'
  sources: Array<{
    sourceUrl?: string
    parsed: ParsedXmltv
  }>
  warnings: string[]
}

export class EpgFetchError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'EpgFetchError'
  }
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: RequestInfo | URL,
  init: RequestInit,
) {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(
    () => controller.abort(new Error('XMLTV fetch timeout')),
    XMLTV_FETCH_TIMEOUT_MS,
  )
  try {
    return await fetchImpl(input, { ...init, signal: controller.signal })
  } finally {
    globalThis.clearTimeout(timeout)
  }
}

async function parseXmltvResponse(
  response: Response,
  options: {
    maxBytes?: number
    decompressionStreamFactory?: XmltvDecompressionStreamFactory
  } = {},
) {
  if (!response.ok) {
    throw new EpgFetchError(`XMLTV HTTP ${response.status} hatası.`)
  }
  const maxBytes = options.maxBytes ?? XMLTV_MAX_BYTES
  const bytes = await readResponseBytes(response, maxBytes)
  const xml = await decodeXmltvBytes(bytes, {
    maxBytes,
    ...(options.decompressionStreamFactory !== undefined
      ? { decompressionStreamFactory: options.decompressionStreamFactory }
      : {}),
  })
  const parsed = parseXmltv(xml)
  if (parsed.channels.length === 0 || parsed.programmes.length === 0) {
    throw new EpgFetchError('XMLTV kullanılabilir kanal ve program içermiyor.')
  }
  return parsed
}

async function directSource(
  epgUrl: string,
  fetchImpl: typeof fetch,
  decompressionStreamFactory?: XmltvDecompressionStreamFactory,
) {
  const response = await fetchWithTimeout(fetchImpl, epgUrl, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'follow',
    headers: {
      accept: 'application/xml,text/xml,text/plain,*/*;q=0.1',
    },
  })
  return await parseXmltvResponse(response, { decompressionStreamFactory })
}

async function fallbackSource(
  list: IptvList,
  epgUrl: string,
  apiFetchImpl: typeof fetch,
  decompressionStreamFactory?: XmltvDecompressionStreamFactory,
) {
  if (list.sourceType !== 'url' || !list.sourceUrl) {
    throw new EpgFetchError(
      'Bu IPTV listesi için API EPG fallback kullanılamaz.',
    )
  }
  const response = await fetchWithTimeout(apiFetchImpl, '/api/epg/fetch', {
    method: 'POST',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ playlistUrl: list.sourceUrl, epgUrl }),
  })
  return await parseXmltvResponse(response, { decompressionStreamFactory })
}

function parserWarnings(sourceUrl: string, parsed: ParsedXmltv) {
  return parsed.warnings.map(({ message }) => `${sourceUrl}: ${message}`)
}

export async function fetchGuideFromUrls(input: {
  list: IptvList
  fetchImpl?: typeof fetch
  apiFetchImpl?: typeof fetch
  decompressionStreamFactory?: XmltvDecompressionStreamFactory
}): Promise<EpgFetchResult> {
  if (input.list.epgUrls.length === 0) {
    throw new EpgFetchError('IPTV listesinde XMLTV adresi tanımlı değil.')
  }
  const fetchImpl = input.fetchImpl ?? fetch
  const apiFetchImpl = input.apiFetchImpl ?? fetch
  const sources: EpgFetchResult['sources'] = []
  const warnings: string[] = []

  for (const epgUrl of input.list.epgUrls) {
    let parsed: ParsedXmltv | null = null
    let directError: unknown
    try {
      parsed = await directSource(
        epgUrl,
        fetchImpl,
        input.decompressionStreamFactory,
      )
    } catch (error) {
      directError = error
    }

    if (!parsed && input.list.sourceType === 'url' && input.list.sourceUrl) {
      try {
        parsed = await fallbackSource(
          input.list,
          epgUrl,
          apiFetchImpl,
          input.decompressionStreamFactory,
        )
      } catch (fallbackError) {
        warnings.push(
          `${epgUrl}: ${
            fallbackError instanceof Error
              ? fallbackError.message
              : 'XMLTV fallback başarısız.'
          }`,
        )
      }
    } else if (!parsed && directError) {
      warnings.push(
        `${epgUrl}: ${
          directError instanceof Error
            ? directError.message
            : 'XMLTV doğrudan alınamadı.'
        }`,
      )
    }

    if (!parsed) continue
    sources.push({ sourceUrl: epgUrl, parsed })
    warnings.push(...parserWarnings(epgUrl, parsed))
  }

  if (sources.length === 0) {
    throw new EpgFetchError('XMLTV kaynaklarının hiçbiri alınamadı.')
  }
  return { mode: 'url', sources, warnings }
}

export async function importGuideFile(
  file: File,
  options: {
    maxBytes?: number
    decompressionStreamFactory?: XmltvDecompressionStreamFactory
  } = {},
): Promise<EpgFetchResult> {
  const maxBytes = options.maxBytes ?? XMLTV_MAX_BYTES
  if (file.size > maxBytes) {
    throw new XmltvPayloadError(
      'xmltv-too-large',
      'XMLTV dosyası izin verilen boyutu aşıyor.',
    )
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const xml = await decodeXmltvBytes(bytes, {
    maxBytes,
    ...(options.decompressionStreamFactory !== undefined
      ? { decompressionStreamFactory: options.decompressionStreamFactory }
      : {}),
  })
  const parsed = parseXmltv(xml)
  if (parsed.channels.length === 0 || parsed.programmes.length === 0) {
    throw new EpgFetchError('XMLTV kullanılabilir kanal ve program içermiyor.')
  }
  return {
    mode: 'file',
    sources: [{ parsed }],
    warnings: parsed.warnings.map(({ message }) => message),
  }
}
