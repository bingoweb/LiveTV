import { extractM3uEpgUrls } from '@livetv/shared'

import {
  fetchPublicHttpText,
  PublicHttpTextError,
  type PublicHttpTextOptions,
} from './public-http-text.js'

const PLAYLIST_MAX_BYTES = 10 * 1024 * 1024
const XMLTV_MAX_BYTES = 50 * 1024 * 1024
const PLAYLIST_TIMEOUT_MS = 12_000
const XMLTV_TIMEOUT_MS = 20_000

export type EpgFallbackErrorCode =
  | 'invalid_epg_request'
  | 'unsafe_epg_url'
  | 'playlist_fetch_failed'
  | 'epg_not_declared_by_playlist'
  | 'epg_fetch_failed'
  | 'epg_response_too_large'

export class EpgFallbackError extends Error {
  constructor(
    public readonly code: EpgFallbackErrorCode,
    public readonly statusCode: 400 | 502,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'EpgFallbackError'
  }
}

export type FetchVerifiedEpgInput = {
  playlistUrl: string
  epgUrl: string
}

type FetchText = typeof fetchPublicHttpText

function normalizeHttpUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch (error) {
    throw new EpgFallbackError(
      'invalid_epg_request',
      400,
      'Geçerli playlist ve EPG URL’leri gerekli.',
      { cause: error },
    )
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new EpgFallbackError(
      'invalid_epg_request',
      400,
      'Yalnız HTTP veya HTTPS EPG adresleri destekleniyor.',
    )
  }
  return url.toString()
}

function requestOptions(
  maxBytes: number,
  timeoutMs: number,
  allowedPrivateHosts?: ReadonlySet<string>,
): PublicHttpTextOptions {
  return {
    maxBytes,
    timeoutMs,
    maxRedirects: 3,
    acceptGzip: true,
    ...(allowedPrivateHosts ? { allowedPrivateHosts } : {}),
  }
}

function mappedFetchError(
  stage: 'playlist' | 'epg',
  error: unknown,
): EpgFallbackError {
  if (error instanceof EpgFallbackError) return error
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : ''
  if (code === 'invalid-url' || code === 'unsafe-url') {
    return new EpgFallbackError(
      'unsafe_epg_url',
      400,
      'EPG fallback güvenli olmayan bir uzak adresi reddetti.',
      { cause: error },
    )
  }
  if (stage === 'epg' && code === 'response-too-large') {
    return new EpgFallbackError(
      'epg_response_too_large',
      502,
      'XMLTV yanıtı izin verilen boyutu aşıyor.',
      { cause: error },
    )
  }
  return new EpgFallbackError(
    stage === 'playlist' ? 'playlist_fetch_failed' : 'epg_fetch_failed',
    502,
    stage === 'playlist'
      ? 'IPTV playlist doğrulaması alınamadı.'
      : 'XMLTV kaynağı alınamadı.',
    { cause: error },
  )
}

export function parseAllowedPrivateHosts(value: string | undefined) {
  return new Set(
    (value ?? '')
      .split(',')
      .map((host) => host.trim().toLowerCase())
      .filter(Boolean),
  )
}

export async function fetchVerifiedEpg(
  input: FetchVerifiedEpgInput,
  deps: {
    fetchText?: FetchText
    allowedPrivateHosts?: ReadonlySet<string>
  } = {},
) {
  const playlistUrl = normalizeHttpUrl(input.playlistUrl)
  const epgUrl = normalizeHttpUrl(input.epgUrl)
  const fetchText = deps.fetchText ?? fetchPublicHttpText

  let playlist
  try {
    playlist = await fetchText(
      playlistUrl,
      requestOptions(
        PLAYLIST_MAX_BYTES,
        PLAYLIST_TIMEOUT_MS,
        deps.allowedPrivateHosts,
      ),
    )
  } catch (error) {
    throw mappedFetchError('playlist', error)
  }

  const declared = extractM3uEpgUrls(playlist.text, playlist.finalUrl)
  if (!declared.includes(epgUrl)) {
    throw new EpgFallbackError(
      'epg_not_declared_by_playlist',
      400,
      'İstenen EPG adresi playlist başlığında ilan edilmiyor.',
    )
  }

  try {
    const epg = await fetchText(
      epgUrl,
      requestOptions(
        XMLTV_MAX_BYTES,
        XMLTV_TIMEOUT_MS,
        deps.allowedPrivateHosts,
      ),
    )
    return { xml: epg.text, epgUrl }
  } catch (error) {
    throw mappedFetchError('epg', error)
  }
}
