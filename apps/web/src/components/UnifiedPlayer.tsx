import {
  PlayerController,
  PlayerSourceError,
  parseYouTubeChannelReference,
  type PlayerQuality,
  type PlayerSource,
  type PlayerSourcePreference,
} from '@livetv/player-core'
import { useEffect, useRef, useState } from 'react'

import type { NavigationItem } from '../navigation'
import {
  createBrowserAdapterFactories,
  type BrowserPlayerState,
} from '../player/browser-adapters'
import type { YouTubeEmbedMode } from '../player/player-config'
import {
  readYouTubeEmbedMode,
  writeYouTubeEmbedMode,
  YOUTUBE_EMBED_MODE_EVENT,
} from '../player/youtube-session'
import {
  featuredYouTubeChannels,
  loadFeaturedLiveStatuses,
  type LiveChannelStatus,
} from '../youtube/live-channels'
import { AppIcon } from './AppIcon'

type UnifiedPlayerProps = {
  route: NavigationItem
}

type PlayerUiState = 'idle' | BrowserPlayerState | 'error'

const sourceKindLabels: Record<PlayerSource['kind'], string> = {
  direct: 'Direct media',
  hls: 'HLS',
  youtube: 'YouTube',
}

type LiveResolverResponse =
  | {
      status: 'live'
      videoId: string
      videoUrl: string
      liveUrl: string
    }
  | {
      status: 'offline'
      liveUrl: string
    }

function routePlaceholder(route: NavigationItem) {
  if (route.id === 'youtube') return 'https://www.youtube.com/watch?v=…'
  if (route.id === 'iptv' || route.id === 'live') return 'https://…/stream.m3u8'
  return 'https://…/video.mp4, .m3u8 veya YouTube URL’si'
}

function errorMessage(error: unknown) {
  if (error instanceof PlayerSourceError) return error.message
  if (error instanceof Error) return error.message
  return 'Kaynak açılırken beklenmeyen bir hata oluştu.'
}

export function UnifiedPlayer({ route }: UnifiedPlayerProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<PlayerController | null>(null)
  const [url, setUrl] = useState('')
  const [preference, setPreference] = useState<PlayerSourcePreference>('auto')
  const [youtubeEmbedMode, setYoutubeEmbedMode] =
    useState<YouTubeEmbedMode>('premium-session')
  const [liveChannelStatuses, setLiveChannelStatuses] = useState<
    readonly LiveChannelStatus[]
  >([])
  const [liveChannelRefreshPending, setLiveChannelRefreshPending] =
    useState(false)
  const [state, setState] = useState<PlayerUiState>('idle')
  const [source, setSource] = useState<PlayerSource | null>(null)
  const [qualities, setQualities] = useState<readonly PlayerQuality[]>([])
  const [selectedQuality, setSelectedQuality] = useState(-1)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setYoutubeEmbedMode(readYouTubeEmbedMode())

    const handleModeChange = (event: Event) => {
      setYoutubeEmbedMode((event as CustomEvent<YouTubeEmbedMode>).detail)
    }

    window.addEventListener(YOUTUBE_EMBED_MODE_EVENT, handleModeChange)
    return () =>
      window.removeEventListener(YOUTUBE_EMBED_MODE_EVENT, handleModeChange)
  }, [])

  useEffect(() => {
    if (route.id !== 'youtube') return

    let active = true

    const refresh = async () => {
      if (!active) return
      setLiveChannelRefreshPending(true)
      const statuses = await loadFeaturedLiveStatuses()
      if (!active) return
      setLiveChannelStatuses(statuses)
      setLiveChannelRefreshPending(false)
    }

    void refresh()
    const timer = window.setInterval(() => void refresh(), 30_000)
    const handleFocus = () => void refresh()
    window.addEventListener('focus', handleFocus)

    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('focus', handleFocus)
    }
  }, [route.id])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const controller = new PlayerController(
      createBrowserAdapterFactories(
        host,
        {
          onStateChange: setState,
          onError: (message) => {
            setError(message)
            setState('error')
          },
          onQualities: (nextQualities) => {
            setQualities(nextQualities)
            setSelectedQuality(-1)
          },
        },
        { getYouTubeEmbedMode: readYouTubeEmbedMode },
      ),
    )

    controllerRef.current = controller
    return () => {
      controllerRef.current = null
      void controller.destroy()
    }
  }, [])

  const resolveYouTubeChannelLive = async (input: string) => {
    const response = await fetch(
      `/api/youtube/resolve-live?url=${encodeURIComponent(input)}`,
    )
    const payload = (await response.json()) as LiveResolverResponse & {
      message?: string
    }

    if (!response.ok) {
      throw new Error(payload.message ?? 'YouTube canlı yayın çözümlenemedi.')
    }

    if (payload.status === 'offline') {
      throw new Error(
        'Bu YouTube kanalında şu anda aktif canlı yayın bulunamadı.',
      )
    }

    return payload.videoUrl
  }

  const openSource = async (
    requestedUrl = url,
    requestedPreference = preference,
  ) => {
    const controller = controllerRef.current
    if (!controller) return

    setError(null)
    setState('loading')
    setQualities([])
    setSelectedQuality(-1)
    setSource(null)

    try {
      await controller.destroy()

      const channelReference =
        requestedPreference === 'auto' || requestedPreference === 'youtube'
          ? parseYouTubeChannelReference(requestedUrl)
          : null
      const playableUrl = channelReference
        ? await resolveYouTubeChannelLive(requestedUrl)
        : requestedUrl

      const nextSource = await controller.load(playableUrl, requestedPreference)
      setSource(nextSource)
    } catch (caughtError) {
      setError(errorMessage(caughtError))
      setState('error')
    }
  }

  const togglePlayback = async () => {
    const controller = controllerRef.current
    if (!controller || !source) return

    try {
      if (state === 'playing') {
        controller.pause()
        return
      }
      await controller.play()
    } catch (caughtError) {
      setError(errorMessage(caughtError))
      setState('error')
    }
  }

  const chooseQuality = (id: number) => {
    controllerRef.current?.setQuality(id)
    setSelectedQuality(id)
  }

  const setPremiumSessionMode = (enabled: boolean) => {
    const mode: YouTubeEmbedMode = enabled ? 'premium-session' : 'privacy'
    setYoutubeEmbedMode(mode)
    writeYouTubeEmbedMode(mode)
  }

  const openFeaturedChannel = (channelUrl: string) => {
    setUrl(channelUrl)
    setPreference('youtube')
    void openSource(channelUrl, 'youtube')
  }

  const refreshFeaturedChannels = async () => {
    setLiveChannelRefreshPending(true)
    const statuses = await loadFeaturedLiveStatuses()
    setLiveChannelStatuses(statuses)
    setLiveChannelRefreshPending(false)
  }

  const liveStatusFor = (channelUrl: string) =>
    liveChannelStatuses.find(({ channel }) => channel.url === channelUrl)

  const statusLabel =
    state === 'idle'
      ? 'Kaynak bekleniyor'
      : state === 'loading'
        ? 'Kaynak hazırlanıyor'
        : state === 'playing'
          ? 'Oynatılıyor'
          : state === 'paused'
            ? 'Duraklatıldı'
            : state === 'ended'
              ? 'Oynatma tamamlandı'
              : state === 'error'
                ? 'Kaynak hatası'
                : 'Oynatıcı hazır'

  return (
    <section
      className={`player-card unified-player${source ? ' has-active-source' : ''}`}
      aria-label="LiveTV oynatıcı alanı"
    >
      <div className="player-toolbar unified-player-toolbar">
        <div className="player-source">
          <span className="player-source-icon">
            <AppIcon
              name={
                source
                  ? source.kind === 'youtube'
                    ? 'youtube'
                    : source.kind === 'hls'
                      ? 'iptv'
                      : 'live'
                  : route.icon
              }
              size={19}
            />
          </span>
          <span>
            <small>Aktif kaynak</small>
            <strong>
              {source ? sourceKindLabels[source.kind] : route.label}
            </strong>
          </span>
        </div>

        <span
          className={`player-ready-chip player-state-chip player-state-chip--${state}`}
        >
          {statusLabel}
        </span>
      </div>

      <form
        className="player-source-form"
        onSubmit={(event) => {
          event.preventDefault()
          void openSource()
        }}
      >
        <div className="player-source-form-heading">
          <label htmlFor="player-source-url">Medya URL’si</label>
          <div className="player-source-form-options">
            <label className="premium-session-toggle">
              <input
                id="youtube-premium-session"
                name="youtube-premium-session"
                type="checkbox"
                aria-label="YouTube Premium oturumunu kullan"
                checked={youtubeEmbedMode === 'premium-session'}
                onChange={(event) =>
                  setPremiumSessionMode(event.target.checked)
                }
              />
              <span className="toggle-track" aria-hidden="true">
                <span />
              </span>
              <span>Premium</span>
            </label>
            <label className="source-mode-control">
              <span>Motor</span>
              <select
                id="player-source-mode"
                name="player-source-mode"
                value={preference}
                onChange={(event) =>
                  setPreference(event.target.value as PlayerSourcePreference)
                }
              >
                <option value="auto">Otomatik</option>
                <option value="hls">HLS</option>
                <option value="youtube">YouTube</option>
                <option value="direct-video">Video</option>
                <option value="direct-audio">Ses</option>
              </select>
            </label>
          </div>
        </div>

        {route.id === 'youtube' ? (
          <div className="featured-youtube-live-section">
            <div className="featured-live-heading">
              <span>Canlı yayınlar</span>
              <button
                type="button"
                disabled={liveChannelRefreshPending}
                onClick={() => void refreshFeaturedChannels()}
              >
                {liveChannelRefreshPending ? 'Kontrol ediliyor…' : 'Yenile'}
              </button>
            </div>
            <div
              className="featured-youtube-channels"
              aria-label="Sabit YouTube canlı kanalları"
            >
              {featuredYouTubeChannels.map((channel) => {
                const status = liveStatusFor(channel.url)
                const statusLabel =
                  status?.status === 'live'
                    ? 'CANLI'
                    : status?.status === 'offline'
                      ? 'Çevrimdışı'
                      : status?.status === 'error'
                        ? 'Durum alınamadı'
                        : 'Kontrol ediliyor'

                return (
                  <button
                    key={channel.url}
                    type="button"
                    className={`featured-channel-button featured-channel-button--${status?.status ?? 'loading'}`}
                    disabled={state === 'loading'}
                    onClick={() => openFeaturedChannel(channel.url)}
                  >
                    <span className="featured-live-dot" aria-hidden="true" />
                    <span>
                      <strong>{channel.name}</strong>
                      <small>
                        {status?.status === 'live' && status.title
                          ? status.title
                          : channel.handle}
                      </small>
                      <em>{statusLabel}</em>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ) : null}

        <div className="player-source-input-row">
          <input
            id="player-source-url"
            type="url"
            value={url}
            placeholder={routePlaceholder(route)}
            autoComplete="off"
            inputMode="url"
            onChange={(event) => setUrl(event.target.value)}
          />
          <button
            className="player-open-button"
            type="submit"
            disabled={!url.trim() || state === 'loading'}
          >
            {state === 'loading' ? 'Açılıyor…' : 'Kaynağı aç'}
          </button>
        </div>
        <p>
          Kanal adresleri aktif /live yayınına çözülür. YouTube oturumu açıkken
          Premium üyeliğin tarayıcı tarafından kullanılabilir.
        </p>
      </form>

      <div
        className={`player-viewport unified-player-viewport${source ? ' has-source' : ''}`}
      >
        <div ref={hostRef} className="player-engine-host" />

        {!source && state !== 'loading' ? (
          <div className="player-empty-state unified-player-empty-state">
            <span className="empty-play-button" aria-hidden="true">
              <span />
            </span>
            <strong>Tek oynatıcı, üç kaynak türü</strong>
            <p>
              Bir medya URL’si gir; LiveTV kaynağı otomatik tanıyıp uygun motoru
              bağlasın.
            </p>
          </div>
        ) : null}

        {state === 'loading' ? (
          <div className="player-loading-state" role="status">
            <span className="player-spinner" aria-hidden="true" />
            <strong>Kaynak hazırlanıyor</strong>
          </div>
        ) : null}

        {error ? (
          <div className="player-error-banner" role="alert">
            <strong>Oynatma başarısız</strong>
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <div className="player-footer unified-player-footer">
        <div>
          <span className="footer-label">Oturum</span>
          <strong>
            {source ? sourceKindLabels[source.kind] : 'Yeni kaynak bekleniyor'}
          </strong>
        </div>

        <div className="unified-player-actions">
          {source?.kind === 'youtube' ? (
            <a
              className="youtube-open-link"
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              YouTube’da aç
            </a>
          ) : null}

          {qualities.length > 1 ? (
            <label className="quality-control">
              <span>Kalite</span>
              <select
                value={selectedQuality}
                onChange={(event) => chooseQuality(Number(event.target.value))}
              >
                {qualities.map((quality) => (
                  <option key={quality.id} value={quality.id}>
                    {quality.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <button
            className="player-session-button"
            type="button"
            disabled={!source || state === 'loading'}
            onClick={() => void togglePlayback()}
          >
            {state === 'playing' ? 'Duraklat' : 'Oynat'}
          </button>
        </div>
      </div>
    </section>
  )
}
