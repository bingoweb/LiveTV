export type M3uParseWarningCode =
  | 'missing-stream-url'
  | 'unsupported-protocol'
  | 'relative-url-without-base'
  | 'invalid-url'

export type M3uParseWarning = {
  line: number
  code: M3uParseWarningCode
  message: string
}

export type ParsedIptvChannel = {
  name: string
  streamUrl: string
  tvgId?: string
  tvgName?: string
  logoUrl?: string
  groupTitle?: string
}

export type ParsedM3uPlaylist = {
  channels: ParsedIptvChannel[]
  epgUrls: string[]
  warnings: M3uParseWarning[]
}
