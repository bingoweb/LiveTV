import type { IptvChannel } from '../iptv/iptv-repository'
import { matchIptvChannelsToXmltv, normalizeGuideName } from './channel-matcher'
import type {
  EpgChannelRecord,
  EpgProgrammeRecord,
  EpgSourceRecord,
} from './epg-repository'
import type { GuideChannelRow, GuideProgramme } from './guide-types'

type DeriveGuideRowsInput = {
  iptvChannels: readonly IptvChannel[]
  sources: readonly EpgSourceRecord[]
  epgChannels: readonly EpgChannelRecord[]
  programmes: readonly EpgProgrammeRecord[]
  selectedDate: string
  now: number
  dateKey?: (epoch: number) => string
}

function defaultDateKey(epoch: number) {
  const date = new Date(epoch)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function guideProgramme(programme: EpgProgrammeRecord): GuideProgramme {
  return { ...programme }
}

function clampProgress(value: number) {
  return Math.min(1, Math.max(0, value))
}

export function deriveGuideRows({
  iptvChannels,
  sources,
  epgChannels,
  programmes,
  selectedDate,
  now,
  dateKey = defaultDateKey,
}: DeriveGuideRowsInput): GuideChannelRow[] {
  const sourceOrder = new Map(
    [...sources]
      .sort((a, b) => a.position - b.position)
      .map(({ sourceKey }, index) => [sourceKey, index]),
  )
  const matches = matchIptvChannelsToXmltv(iptvChannels, epgChannels)

  return matches.map(({ channel, xmltvChannels, match }) => {
    const identities = new Set(
      xmltvChannels.map(({ sourceKey, xmltvId }) =>
        JSON.stringify([sourceKey, xmltvId]),
      ),
    )
    const candidates = programmes
      .filter(({ sourceKey, xmltvChannelId }) =>
        identities.has(JSON.stringify([sourceKey, xmltvChannelId])),
      )
      .sort(
        (a, b) =>
          (sourceOrder.get(a.sourceKey) ?? Number.MAX_SAFE_INTEGER) -
            (sourceOrder.get(b.sourceKey) ?? Number.MAX_SAFE_INTEGER) ||
          a.startAt - b.startAt ||
          a.stopAt - b.stopAt,
      )

    const deduped: EpgProgrammeRecord[] = []
    const seen = new Set<string>()
    for (const candidate of candidates) {
      const identity = JSON.stringify([
        channel.id,
        candidate.startAt,
        candidate.stopAt,
        normalizeGuideName(candidate.title),
      ])
      if (seen.has(identity)) continue
      seen.add(identity)
      deduped.push(candidate)
    }
    deduped.sort((a, b) => a.startAt - b.startAt || a.stopAt - b.stopAt)

    const currentRecord =
      deduped.find(({ startAt, stopAt }) => startAt <= now && stopAt > now) ??
      null
    const nextRecord =
      deduped.find(
        ({ startAt }) => startAt > now && startAt !== currentRecord?.startAt,
      ) ?? null
    const progress = currentRecord
      ? clampProgress(
          (now - currentRecord.startAt) /
            Math.max(1, currentRecord.stopAt - currentRecord.startAt),
        )
      : null
    const selected = deduped
      .filter(({ startAt }) => dateKey(startAt) === selectedDate)
      .map(guideProgramme)

    return {
      channel,
      match,
      current: currentRecord ? guideProgramme(currentRecord) : null,
      next: nextRecord ? guideProgramme(nextRecord) : null,
      progress,
      programmes: selected,
    }
  })
}
