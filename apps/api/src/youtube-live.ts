export type YouTubeLiveResolution =
  | {
      status: 'live'
      videoId: string
      channelId?: string
      title?: string
      thumbnailUrl?: string
    }
  | {
      status: 'offline'
      channelId?: string
    }

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
])

function extractFirst(html: string, patterns: readonly RegExp[]) {
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }

  return undefined
}

function decodeHtml(value: string | undefined) {
  if (!value) return undefined

  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
}

export function normalizeYouTubeChannelLiveUrl(input: string) {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new Error('Geçerli bir YouTube kanal adresi gir.')
  }

  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) {
    throw new Error('Bu çözümleyici yalnız YouTube kanal adresleri içindir.')
  }

  const parts = url.pathname.split('/').filter(Boolean)
  const first = parts[0] ?? ''
  const supportedChannelPath =
    first.startsWith('@') || ['channel', 'user', 'c'].includes(first)

  if (!supportedChannelPath) {
    throw new Error('YouTube kanal veya @handle adresi bekleniyor.')
  }

  const liveParts = parts.at(-1) === 'live' ? parts : [...parts, 'live']
  url.hostname = 'www.youtube.com'
  url.pathname = `/${liveParts.join('/')}`
  url.search = ''
  url.hash = ''

  return url.toString().replace(/\/$/, '')
}

export function extractYouTubeLivePage(html: string): YouTubeLiveResolution {
  const canonical = extractFirst(html, [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
    /<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
  ])

  const canonicalVideoId = canonical?.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1]
  const videoDetails = html.match(
    /"videoDetails":\{([\s\S]{0,6000}?)\}(?:,|\})/,
  )?.[1]
  const liveDetailsVideoId =
    videoDetails?.includes('"isLiveContent":true') === true
      ? videoDetails.match(/"videoId":"([A-Za-z0-9_-]{11})"/)?.[1]
      : undefined
  const videoId = canonicalVideoId ?? liveDetailsVideoId
  const channelId = extractFirst(html, [
    /"channelId":"(UC[A-Za-z0-9_-]+)"/,
    /"externalId":"(UC[A-Za-z0-9_-]+)"/,
  ])
  const title = decodeHtml(
    extractFirst(html, [
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']title["'][^>]+content=["']([^"']+)["']/i,
    ]),
  )
  const thumbnailUrl = decodeHtml(
    extractFirst(html, [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    ]),
  )

  if (videoId) {
    return {
      status: 'live',
      videoId,
      ...(channelId ? { channelId } : {}),
      ...(title ? { title } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    }
  }

  const canonicalLooksLikeChannel =
    canonical !== undefined &&
    /youtube\.com\/(?:@[^/?#]+|channel\/[^/?#]+|user\/[^/?#]+|c\/[^/?#]+)/i.test(
      canonical,
    )

  if (!channelId && !canonicalLooksLikeChannel) {
    throw new Error('YouTube canlı sayfası beklenen kanal verisini içermiyor.')
  }

  return {
    status: 'offline',
    ...(channelId ? { channelId } : {}),
  }
}

export async function resolveYouTubeChannelLive(
  input: string,
  fetchImpl: typeof fetch = fetch,
) {
  const liveUrl = normalizeYouTubeChannelLiveUrl(input)
  let response: Response | undefined
  let lastError: unknown

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      response = await fetchImpl(liveUrl, {
        redirect: 'follow',
        signal: AbortSignal.timeout(12_000),
        headers: {
          'user-agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/151 Safari/537.36',
          'accept-language': 'tr-TR,tr;q=0.9,en;q=0.8',
          accept: 'text/html,application/xhtml+xml',
        },
      })

      if (response.ok || (response.status < 500 && response.status !== 429))
        break
      lastError = new Error(
        `YouTube canlı sayfası alınamadı (${response.status}).`,
      )
    } catch (error) {
      lastError = error
      response = undefined
    }
  }

  if (!response) {
    throw lastError instanceof Error
      ? lastError
      : new Error('YouTube canlı sayfasına erişilemedi.')
  }

  if (!response.ok) {
    throw new Error(`YouTube canlı sayfası alınamadı (${response.status}).`)
  }

  const resolution = extractYouTubeLivePage(await response.text())

  if (resolution.status === 'live') {
    return {
      ...resolution,
      liveUrl,
      videoUrl: `https://www.youtube.com/watch?v=${resolution.videoId}`,
    }
  }

  return {
    ...resolution,
    liveUrl,
  }
}
