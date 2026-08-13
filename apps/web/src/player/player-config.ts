import type { PlayerQuality } from '@livetv/player-core'
import type Plyr from 'plyr'

export type HlsLevelLike = {
  height?: number
  bitrate?: number
}

export type YouTubeEmbedMode = 'privacy' | 'premium-session'

const PLAYER_CONTROLS = [
  'play-large',
  'play',
  'progress',
  'current-time',
  'mute',
  'volume',
  'settings',
  'pip',
  'fullscreen',
] as const

export function buildBasePlyrOptions(): Plyr.Options {
  return {
    autoplay: false,
    controls: [...PLAYER_CONTROLS],
    clickToPlay: true,
    hideControls: true,
    keyboard: { focused: true, global: false },
    fullscreen: { enabled: true, fallback: true, iosNative: true },
    tooltips: { controls: true, seek: true },
    storage: { enabled: true, key: 'livetv-plyr' },
  }
}

export function buildYouTubePlyrOptions(
  origin: string,
  mode: YouTubeEmbedMode = 'privacy',
): Plyr.Options {
  return {
    ...buildBasePlyrOptions(),
    youtube: {
      noCookie: mode !== 'premium-session',
      rel: 0,
      modestbranding: 1,
      playsinline: 1,
      origin,
    },
  }
}

export function toHlsQualities(
  levels: readonly HlsLevelLike[],
): readonly PlayerQuality[] {
  const seenHeights = new Set<number>()
  const qualities: PlayerQuality[] = [{ id: -1, label: 'Auto' }]

  levels.forEach((level, index) => {
    const height = level.height ?? 0
    if (height > 0) {
      if (seenHeights.has(height)) return
      seenHeights.add(height)
    }

    const label =
      height > 0
        ? `${height}p`
        : level.bitrate
          ? `${Math.round(level.bitrate / 1000)} kbps`
          : `Seviye ${index + 1}`

    qualities.push({
      id: index,
      label,
      ...(height > 0 ? { height } : {}),
      ...(level.bitrate ? { bitrate: level.bitrate } : {}),
    })
  })

  return qualities
}
