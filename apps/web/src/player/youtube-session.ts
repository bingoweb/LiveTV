import type { YouTubeEmbedMode } from './player-config'

export const YOUTUBE_EMBED_MODE_STORAGE_KEY = 'livetv.youtube.embed-mode'
export const YOUTUBE_EMBED_MODE_EVENT = 'livetv:youtube-embed-mode'

export function readYouTubeEmbedMode(): YouTubeEmbedMode {
  if (typeof window === 'undefined') return 'premium-session'

  const stored = window.localStorage.getItem(YOUTUBE_EMBED_MODE_STORAGE_KEY)
  return stored === 'privacy' ? 'privacy' : 'premium-session'
}

export function writeYouTubeEmbedMode(mode: YouTubeEmbedMode) {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(YOUTUBE_EMBED_MODE_STORAGE_KEY, mode)
  window.dispatchEvent(
    new CustomEvent<YouTubeEmbedMode>(YOUTUBE_EMBED_MODE_EVENT, {
      detail: mode,
    }),
  )
}
