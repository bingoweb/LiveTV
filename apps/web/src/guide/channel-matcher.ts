import type { IptvChannel } from '../iptv/iptv-repository'
import type { EpgChannelRecord } from './epg-repository'

export type ChannelGuideMatch = {
  channel: IptvChannel
  xmltvChannels: EpgChannelRecord[]
  match: 'exact-id' | 'folded-id' | 'display-name' | 'none'
}

function compact(value: string | undefined) {
  const trimmed = value?.trim()
  return trimmed || undefined
}

export function normalizeGuideName(value: string) {
  return value
    .normalize('NFKC')
    .trim()
    .replace(/^[\p{P}\p{S}\s]+|[\p{P}\p{S}\s]+$/gu, '')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
}

function uniqueIdGroup(candidates: readonly EpgChannelRecord[]) {
  const groups = new Map<string, EpgChannelRecord[]>()
  for (const candidate of candidates) {
    const key = candidate.xmltvId
    const group = groups.get(key)
    if (group) group.push(candidate)
    else groups.set(key, [candidate])
  }
  return groups.size === 1 ? ([...groups.values()][0] ?? []) : []
}

export function matchIptvChannelsToXmltv(
  iptvChannels: readonly IptvChannel[],
  epgChannels: readonly EpgChannelRecord[],
): ChannelGuideMatch[] {
  const weakClaims = new Set<string>()

  return iptvChannels.map((channel) => {
    const tvgId = compact(channel.tvgId)
    if (tvgId) {
      const exact = epgChannels.filter(({ xmltvId }) => xmltvId === tvgId)
      if (exact.length > 0) {
        return { channel, xmltvChannels: exact, match: 'exact-id' as const }
      }

      const folded = uniqueIdGroup(
        epgChannels.filter(
          ({ xmltvId }) =>
            xmltvId.toLocaleLowerCase() === tvgId.toLocaleLowerCase(),
        ),
      )
      if (folded.length > 0) {
        return { channel, xmltvChannels: folded, match: 'folded-id' as const }
      }
    }

    for (const candidateName of [
      compact(channel.tvgName),
      compact(channel.name),
    ]) {
      if (!candidateName) continue
      const normalized = normalizeGuideName(candidateName)
      if (!normalized) continue
      const matching = epgChannels.filter(({ displayNames }) =>
        displayNames.some((name) => normalizeGuideName(name) === normalized),
      )
      const group = uniqueIdGroup(matching)
      if (group.length === 0) continue
      const claim = group[0]?.xmltvId.toLocaleLowerCase()
      if (!claim || weakClaims.has(claim)) continue
      weakClaims.add(claim)
      return { channel, xmltvChannels: group, match: 'display-name' as const }
    }

    return { channel, xmltvChannels: [], match: 'none' as const }
  })
}
