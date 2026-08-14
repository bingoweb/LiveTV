function unquote(value: string) {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseAttributes(input: string) {
  const attributes = new Map<string, string>()
  const expression = /([A-Za-z0-9_-]+)=("[^"]*"|'[^']*'|[^\s]+)/g
  for (const match of input.matchAll(expression)) {
    const name = match[1]?.toLowerCase()
    const value = match[2]
    if (!name || value === undefined) continue
    attributes.set(name, unquote(value))
  }
  return attributes
}

function normalizeHttpUrl(value: string, baseUrl?: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  try {
    const url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString()
  } catch {
    return null
  }
}

export function extractM3uEpgUrls(text: string, baseUrl?: string) {
  const header = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toUpperCase().startsWith('#EXTM3U'))

  if (!header) return []

  const attributes = parseAttributes(header)
  const seen = new Set<string>()
  const result: string[] = []

  for (const key of ['url-tvg', 'x-tvg-url', 'tvg-url']) {
    const raw = attributes.get(key)
    if (!raw) continue
    for (const candidate of raw.split(/[,\s]+/).map((value) => value.trim())) {
      const normalized = normalizeHttpUrl(candidate, baseUrl)
      if (!normalized || seen.has(normalized)) continue
      seen.add(normalized)
      result.push(normalized)
    }
  }

  return result
}
