import { parseM3u } from './m3u-parser'
import type { ParsedM3uPlaylist } from './m3u-types'

export const IPTV_MAX_IMPORT_BYTES = 10 * 1024 * 1024
const DEFAULT_IMPORT_TIMEOUT_MS = 12_000

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type IptvImportResult = {
  playlist: ParsedM3uPlaylist
  suggestedName: string
}

function textSize(text: string) {
  return new TextEncoder().encode(text).byteLength
}

function assertSize(size: number) {
  if (size > IPTV_MAX_IMPORT_BYTES) {
    throw new Error('IPTV listesi 10 MiB boyut sınırını aşıyor.')
  }
}

function assertHasChannels(playlist: ParsedM3uPlaylist) {
  if (playlist.channels.length === 0) {
    throw new Error('IPTV listesinde geçerli kanal bulunamadı.')
  }
}

function stripPlaylistExtension(value: string) {
  return value.replace(/\.(?:m3u8?|txt)$/i, '')
}

function suggestedNameFromUrl(url: URL) {
  const lastSegment = url.pathname.split('/').filter(Boolean).pop()
  if (!lastSegment) return url.hostname
  try {
    return (
      stripPlaylistExtension(decodeURIComponent(lastSegment)) || url.hostname
    )
  } catch {
    return stripPlaylistExtension(lastSegment) || url.hostname
  }
}

function suggestedNameFromFile(file: File) {
  return stripPlaylistExtension(file.name.trim()) || 'IPTV Listesi'
}

export function importIptvFromText(
  text: string,
  options: { suggestedName?: string } = {},
): IptvImportResult {
  assertSize(textSize(text))
  const playlist = parseM3u(text)
  assertHasChannels(playlist)
  return {
    playlist,
    suggestedName: options.suggestedName?.trim() || 'IPTV Listesi',
  }
}

export async function importIptvFromFile(
  file: File,
): Promise<IptvImportResult> {
  assertSize(file.size)
  const text = await file.text()
  assertSize(textSize(text))
  const playlist = parseM3u(text)
  assertHasChannels(playlist)
  return { playlist, suggestedName: suggestedNameFromFile(file) }
}

export async function importIptvFromUrl(
  input: string,
  options: { fetchImpl?: FetchLike; timeoutMs?: number } = {},
): Promise<IptvImportResult> {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('Geçerli bir IPTV liste URL’si gir.')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('IPTV liste adresi HTTP veya HTTPS olmalı.')
  }

  const controller = new AbortController()
  const timeout = globalThis.setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? DEFAULT_IMPORT_TIMEOUT_MS,
  )
  const fetchImpl = options.fetchImpl ?? fetch

  try {
    const response = await fetchImpl(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`IPTV listesi indirilemedi: HTTP ${response.status}.`)
    }

    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength >= 0) {
      assertSize(contentLength)
    }

    const text = await response.text()
    assertSize(textSize(text))
    const playlist = parseM3u(text, { baseUrl: url.toString() })
    assertHasChannels(playlist)
    return { playlist, suggestedName: suggestedNameFromUrl(url) }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('IPTV liste isteği zaman aşımına uğradı.', {
        cause: error,
      })
    }
    if (error instanceof Error) throw error
    throw new Error('IPTV listesi indirilemedi.', { cause: error })
  } finally {
    globalThis.clearTimeout(timeout)
  }
}
