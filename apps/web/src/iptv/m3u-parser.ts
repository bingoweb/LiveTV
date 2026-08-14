import { extractM3uEpgUrls } from '@livetv/shared'

import type {
  M3uParseWarning,
  ParsedIptvChannel,
  ParsedM3uPlaylist,
} from './m3u-types'

type PendingChannel = {
  line: number
  displayName: string
  tvgId?: string
  tvgName?: string
  logoUrl?: string
  groupTitle?: string
  extGroup?: string
}

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

function splitOutsideQuotes(input: string, separator: string) {
  let quote: '"' | "'" | null = null
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index]
    if (character === '"' || character === "'") {
      quote = quote === character ? null : (quote ?? character)
      continue
    }
    if (!quote && character === separator) {
      return [input.slice(0, index), input.slice(index + 1)] as const
    }
  }
  return [input, ''] as const
}

function compact(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function parseExtInf(line: string, lineNumber: number): PendingChannel {
  const payload = line.slice('#EXTINF:'.length)
  const [metadata, displayName] = splitOutsideQuotes(payload, ',')
  const attributes = parseAttributes(metadata)

  return {
    line: lineNumber,
    displayName: displayName.trim(),
    tvgId: compact(attributes.get('tvg-id')),
    tvgName: compact(attributes.get('tvg-name')),
    logoUrl: compact(attributes.get('tvg-logo')),
    groupTitle: compact(attributes.get('group-title')),
  }
}

function resolveStreamUrl(
  value: string,
  baseUrl: string | undefined,
): { url: string } | { code: M3uParseWarning['code']; message: string } {
  const trimmed = value.trim()
  const hasScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(trimmed)

  let url: URL
  try {
    url = baseUrl ? new URL(trimmed, baseUrl) : new URL(trimmed)
  } catch {
    if (!baseUrl && !hasScheme) {
      return {
        code: 'relative-url-without-base',
        message: 'Göreli IPTV URL’si için bir kaynak liste adresi gerekiyor.',
      }
    }
    return { code: 'invalid-url', message: 'Geçersiz IPTV yayın URL’si.' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return {
      code: 'unsupported-protocol',
      message: 'Yalnız HTTP veya HTTPS IPTV yayınları destekleniyor.',
    }
  }

  return { url: url.toString() }
}

function fallbackName(streamUrl: string) {
  const url = new URL(streamUrl)
  const path = url.pathname === '/' ? '' : url.pathname
  return `${url.host}${path}`
}

function buildChannel(pending: PendingChannel, streamUrl: string) {
  const channel: ParsedIptvChannel = {
    name:
      compact(pending.tvgName) ??
      compact(pending.displayName) ??
      fallbackName(streamUrl),
    streamUrl,
  }
  if (pending.tvgId) channel.tvgId = pending.tvgId
  if (pending.tvgName) channel.tvgName = pending.tvgName
  if (pending.logoUrl) channel.logoUrl = pending.logoUrl
  const groupTitle = pending.groupTitle ?? compact(pending.extGroup)
  if (groupTitle) channel.groupTitle = groupTitle
  return channel
}

export function parseM3u(
  text: string,
  options: { baseUrl?: string } = {},
): ParsedM3uPlaylist {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/)
  const channels: ParsedIptvChannel[] = []
  const warnings: M3uParseWarning[] = []
  const epgUrls = new Set<string>()
  const identities = new Set<string>()
  let pending: PendingChannel | null = null

  const markMissing = () => {
    if (!pending) return
    warnings.push({
      line: pending.line,
      code: 'missing-stream-url',
      message: 'Kanal metadata satırından sonra yayın URL’si bulunamadı.',
    })
    pending = null
  }

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const line = raw.trim()
    const lineNumber = index + 1
    if (!line) continue

    if (line.toUpperCase().startsWith('#EXTM3U')) {
      for (const epgUrl of extractM3uEpgUrls(line, options.baseUrl)) {
        epgUrls.add(epgUrl)
      }
      continue
    }

    if (line.toUpperCase().startsWith('#EXTINF:')) {
      markMissing()
      pending = parseExtInf(line, lineNumber)
      continue
    }

    if (line.toUpperCase().startsWith('#EXTGRP:')) {
      if (pending && !pending.groupTitle) {
        pending.extGroup = line.slice('#EXTGRP:'.length).trim()
      }
      continue
    }

    if (line.startsWith('#')) continue

    const metadata = pending ?? {
      line: lineNumber,
      displayName: '',
    }
    const resolved = resolveStreamUrl(line, options.baseUrl)
    pending = null
    if ('code' in resolved) {
      warnings.push({ line: lineNumber, ...resolved })
      continue
    }

    const channel = buildChannel(metadata, resolved.url)
    const identity = `${channel.tvgId ?? ''}\u0000${channel.streamUrl}`
    if (identities.has(identity)) continue
    identities.add(identity)
    channels.push(channel)
  }

  markMissing()
  return { channels, epgUrls: [...epgUrls], warnings }
}
