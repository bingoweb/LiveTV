import { XMLParser } from 'fast-xml-parser'

export type LocalWallClockParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export type XmltvChannel = {
  id: string
  displayNames: string[]
  iconUrl?: string
}

export type XmltvProgramme = {
  channelId: string
  startAt: number
  stopAt: number
  title: string
  subTitle?: string
  description?: string
  categories: string[]
  iconUrl?: string
}

export type XmltvWarning = {
  code:
    'invalid-channel' | 'invalid-programme' | 'inferred-stop' | 'default-stop'
  message: string
}

export type ParsedXmltv = {
  channels: XmltvChannel[]
  programmes: XmltvProgramme[]
  warnings: XmltvWarning[]
}

type ParseXmltvOptions = {
  localWallClockToEpoch?: (parts: LocalWallClockParts) => number
}

type RawProgramme = Omit<XmltvProgramme, 'stopAt'> & {
  stopAt?: number
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
})

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function textValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || undefined
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (typeof value === 'object' && value !== null) {
    const text = (value as Record<string, unknown>)['#text']
    return textValue(text)
  }
  return undefined
}

function attribute(record: Record<string, unknown>, name: string) {
  const value = record[`@_${name}`]
  return typeof value === 'string' ? value.trim() : undefined
}

function isValidDateParts(parts: LocalWallClockParts) {
  const probe = new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    ),
  )
  return (
    probe.getUTCFullYear() === parts.year &&
    probe.getUTCMonth() === parts.month - 1 &&
    probe.getUTCDate() === parts.day &&
    probe.getUTCHours() === parts.hour &&
    probe.getUTCMinutes() === parts.minute &&
    probe.getUTCSeconds() === parts.second
  )
}

function parseTimestamp(
  value: string | undefined,
  localWallClockToEpoch: (parts: LocalWallClockParts) => number,
) {
  if (!value) return undefined
  const match = value
    .trim()
    .match(/^(\d{12}|\d{14})(?:\s*([+-])(\d{2})(\d{2}))?(?:\s+\S+)?$/)
  if (!match) return undefined

  const digits = match[1]
  if (!digits) return undefined
  const parts: LocalWallClockParts = {
    year: Number(digits.slice(0, 4)),
    month: Number(digits.slice(4, 6)),
    day: Number(digits.slice(6, 8)),
    hour: Number(digits.slice(8, 10)),
    minute: Number(digits.slice(10, 12)),
    second: digits.length >= 14 ? Number(digits.slice(12, 14)) : 0,
  }
  if (!isValidDateParts(parts)) return undefined

  const sign = match[2]
  if (!sign) {
    const epoch = localWallClockToEpoch(parts)
    return Number.isFinite(epoch) ? epoch : undefined
  }

  const offsetHours = Number(match[3])
  const offsetMinutes = Number(match[4])
  if (offsetHours > 23 || offsetMinutes > 59) return undefined
  const offset = (offsetHours * 60 + offsetMinutes) * 60_000
  const wallUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  return sign === '+' ? wallUtc - offset : wallUtc + offset
}

function defaultLocalWallClockToEpoch(parts: LocalWallClockParts) {
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ).getTime()
}

function normalizeChannel(value: unknown): XmltvChannel | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const id = attribute(record, 'id')
  if (!id) return null
  const displayNames = asArray(record['display-name'])
    .map(textValue)
    .filter((name): name is string => Boolean(name))
  const iconRecord = asArray(record.icon)[0]
  const iconUrl =
    typeof iconRecord === 'object' && iconRecord !== null
      ? attribute(iconRecord as Record<string, unknown>, 'src')
      : undefined
  return {
    id,
    displayNames,
    ...(iconUrl ? { iconUrl } : {}),
  }
}

function normalizeProgramme(
  value: unknown,
  localWallClockToEpoch: (parts: LocalWallClockParts) => number,
): RawProgramme | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  const channelId = attribute(record, 'channel')
  const title = textValue(record.title)
  const startAt = parseTimestamp(
    attribute(record, 'start'),
    localWallClockToEpoch,
  )
  const stopAt = parseTimestamp(
    attribute(record, 'stop'),
    localWallClockToEpoch,
  )
  if (!channelId || !title || startAt === undefined) return null

  const subTitle = textValue(record['sub-title'])
  const description = textValue(record.desc)
  const categories = asArray(record.category)
    .map(textValue)
    .filter((category): category is string => Boolean(category))
  const iconRecord = asArray(record.icon)[0]
  const iconUrl =
    typeof iconRecord === 'object' && iconRecord !== null
      ? attribute(iconRecord as Record<string, unknown>, 'src')
      : undefined

  return {
    channelId,
    startAt,
    ...(stopAt !== undefined && stopAt > startAt ? { stopAt } : {}),
    title,
    ...(subTitle ? { subTitle } : {}),
    ...(description ? { description } : {}),
    categories,
    ...(iconUrl ? { iconUrl } : {}),
  }
}

export function parseXmltv(
  xml: string,
  options: ParseXmltvOptions = {},
): ParsedXmltv {
  const document = parser.parse(xml) as Record<string, unknown>
  const tv = document.tv
  if (typeof tv !== 'object' || tv === null) {
    throw new Error('XMLTV kök <tv> öğesi bulunamadı.')
  }
  const tvRecord = tv as Record<string, unknown>
  const warnings: XmltvWarning[] = []
  const channels: XmltvChannel[] = []
  const localWallClockToEpoch =
    options.localWallClockToEpoch ?? defaultLocalWallClockToEpoch

  for (const raw of asArray(tvRecord.channel)) {
    const channel = normalizeChannel(raw)
    if (!channel) {
      warnings.push({
        code: 'invalid-channel',
        message: 'Geçersiz XMLTV kanal kaydı atlandı.',
      })
      continue
    }
    channels.push(channel)
  }

  const pending: RawProgramme[] = []
  for (const raw of asArray(tvRecord.programme)) {
    const programme = normalizeProgramme(raw, localWallClockToEpoch)
    if (!programme) {
      warnings.push({
        code: 'invalid-programme',
        message: 'Geçersiz XMLTV program kaydı atlandı.',
      })
      continue
    }
    pending.push(programme)
  }

  pending.sort(
    (left, right) =>
      left.channelId.localeCompare(right.channelId) ||
      left.startAt - right.startAt,
  )

  const programmes: XmltvProgramme[] = []
  const identities = new Set<string>()
  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]
    if (!current) continue
    let stopAt = current.stopAt
    if (stopAt === undefined) {
      const next = pending[index + 1]
      if (
        next &&
        next.channelId === current.channelId &&
        next.startAt > current.startAt
      ) {
        stopAt = next.startAt
        warnings.push({
          code: 'inferred-stop',
          message: `${current.title} programının bitiş saati sonraki programdan çıkarıldı.`,
        })
      } else {
        stopAt = current.startAt + 30 * 60_000
        warnings.push({
          code: 'default-stop',
          message: `${current.title} programı için 30 dakikalık varsayılan süre kullanıldı.`,
        })
      }
    }

    const identity = JSON.stringify([
      current.channelId,
      current.startAt,
      stopAt,
      current.title,
    ])
    if (identities.has(identity)) continue
    identities.add(identity)
    programmes.push({ ...current, stopAt })
  }

  return { channels, programmes, warnings }
}
