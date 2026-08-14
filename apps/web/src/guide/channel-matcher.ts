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
  const channelsBySource = new Map<string, EpgChannelRecord[]>()
  for (const epgChannel of epgChannels) {
    const source = channelsBySource.get(epgChannel.sourceKey)
    if (source) source.push(epgChannel)
    else channelsBySource.set(epgChannel.sourceKey, [epgChannel])
  }

  const matchRank = {
    none: 0,
    'display-name': 1,
    'folded-id': 2,
    'exact-id': 3,
  } as const

  return iptvChannels.map((channel) => {
    const tvgId = compact(channel.tvgId)
    const xmltvChannels: EpgChannelRecord[] = []
    let strongestMatch: ChannelGuideMatch['match'] = 'none'

    for (const [sourceKey, sourceChannels] of channelsBySource) {
      let sourceMatch: EpgChannelRecord[] = []
      let reason: ChannelGuideMatch['match'] = 'none'

      if (tvgId) {
        const exact = sourceChannels.filter(({ xmltvId }) => xmltvId === tvgId)
        if (exact.length > 0) {
          sourceMatch = exact
          reason = 'exact-id'
        } else {
          const folded = uniqueIdGroup(
            sourceChannels.filter(
              ({ xmltvId }) =>
                xmltvId.toLocaleLowerCase() === tvgId.toLocaleLowerCase(),
            ),
          )
          if (folded.length > 0) {
            sourceMatch = folded
            reason = 'folded-id'
          }
        }
      }

      if (sourceMatch.length === 0) {
        for (const candidateName of [
          compact(channel.tvgName),
          compact(channel.name),
        ]) {
          if (!candidateName) continue
          const normalized = normalizeGuideName(candidateName)
          if (!normalized) continue
          const matching = sourceChannels.filter(({ displayNames }) =>
            displayNames.some(
              (name) => normalizeGuideName(name) === normalized,
            ),
          )
          const group = uniqueIdGroup(matching)
          if (group.length === 0) continue
          const xmltvId = group[0]?.xmltvId
          if (!xmltvId) continue
          const claim = JSON.stringify([sourceKey, xmltvId.toLocaleLowerCase()])
          if (weakClaims.has(claim)) continue
          weakClaims.add(claim)
          sourceMatch = group
          reason = 'display-name'
          break
        }
      }

      if (sourceMatch.length > 0) {
        xmltvChannels.push(...sourceMatch)
        if (matchRank[reason] > matchRank[strongestMatch]) {
          strongestMatch = reason
        }
      }
    }

    return { channel, xmltvChannels, match: strongestMatch }
  })
}
