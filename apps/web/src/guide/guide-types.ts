import type { IptvChannel } from '../iptv/iptv-repository'

export type GuideProgramme = {
  id: string
  sourceKey: string
  xmltvChannelId: string
  startAt: number
  stopAt: number
  title: string
  subTitle?: string
  description?: string
  categories: string[]
  iconUrl?: string
}

export type GuideChannelRow = {
  channel: IptvChannel
  match: 'exact-id' | 'folded-id' | 'display-name' | 'none'
  current: GuideProgramme | null
  next: GuideProgramme | null
  progress: number | null
  programmes: GuideProgramme[]
}
