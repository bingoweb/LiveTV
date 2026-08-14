import type { ParsedIptvChannel } from './m3u-types'

function searchableText(channel: ParsedIptvChannel) {
  let host = ''
  try {
    host = new URL(channel.streamUrl).host
  } catch {
    // Persisted rows are validated elsewhere; search remains defensive.
  }
  return [
    channel.name,
    channel.tvgName,
    channel.tvgId,
    channel.groupTitle,
    host,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('tr-TR')
}

export function filterIptvChannels<T extends ParsedIptvChannel>(
  channels: readonly T[],
  options: { query: string; group: string | null },
): T[] {
  const query = options.query.trim().toLocaleLowerCase('tr-TR')
  return channels.filter((channel) => {
    if (options.group !== null) {
      const group = channel.groupTitle?.trim() ?? ''
      if (group !== options.group) return false
    }
    return !query || searchableText(channel).includes(query)
  })
}

export function listIptvGroups(
  channels: readonly ParsedIptvChannel[],
): string[] {
  const groups = new Set<string>()
  let hasUngrouped = false
  for (const channel of channels) {
    const group = channel.groupTitle?.trim() ?? ''
    if (group) groups.add(group)
    else hasUngrouped = true
  }
  const sorted = [...groups].sort((left, right) =>
    left.localeCompare(right, 'tr-TR'),
  )
  if (hasUngrouped) sorted.push('')
  return sorted
}
