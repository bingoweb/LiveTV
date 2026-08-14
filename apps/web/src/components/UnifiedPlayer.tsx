import {
  PlayerController,
  PlayerSourceError,
  parseYouTubeChannelReference,
  type PlayerSource,
} from '@livetv/player-core'
import { useEffect, useRef, useState } from 'react'

import {
  createBrowserAdapterFactories,
  type BrowserPlayerState,
} from '../player/browser-adapters'
import { loadYouTubeChannelWithRecovery } from '../player/youtube-live-recovery'
import { readYouTubeEmbedMode } from '../player/youtube-session'

type PlayerUiState = 'idle' | BrowserPlayerState | 'error'

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

function errorMessage(error: unknown) {
  if (error instanceof PlayerSourceError) return error.message
  if (error instanceof Error) return error.message
  return 'Kaynak açılırken beklenmeyen bir hata oluştu.'
}

export function UnifiedPlayer() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const controllerRef = useRef<PlayerController | null>(null)
  const [url, setUrl] = useState('')
  const [state, setState] = useState<PlayerUiState>('idle')
  const [source, setSource] = useState<PlayerSource | null>(null)
  const [error, setError] = useState<string | null>(null)

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
          onQualities: () => {},
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

  const openSource = async () => {
    const controller = controllerRef.current
    const requestedUrl = url.trim()
    if (!controller || !requestedUrl) return

    setError(null)
    setState('loading')
    setSource(null)

    try {
      await controller.destroy()

      const channelReference = parseYouTubeChannelReference(requestedUrl)
      const nextSource = channelReference
        ? await loadYouTubeChannelWithRecovery(
            requestedUrl,
            resolveYouTubeChannelLive,
            (playableUrl) => controller.load(playableUrl, 'auto'),
          )
        : await controller.load(requestedUrl, 'auto')

      setSource(nextSource)
    } catch (caughtError) {
      setError(errorMessage(caughtError))
      setState('error')
    }
  }

  const statusLabel =
    state === 'idle'
      ? 'Hazır'
      : state === 'loading'
        ? 'Yükleniyor'
        : state === 'playing'
          ? 'Oynatılıyor'
          : state === 'paused'
            ? 'Duraklatıldı'
            : state === 'ended'
              ? 'Tamamlandı'
              : state === 'error'
                ? 'Kaynak hatası'
                : 'Oynatıcı hazır'

  return (
    <section
      className={`player-card unified-player simple-watch-player${source ? ' has-active-source' : ''}`}
      aria-label="LiveTV oynatıcı alanı"
    >
      <div className="simple-watch-intro">
        <div>
          <span className="simple-watch-kicker">Yükle ve izle</span>
          <h1>İzlemek istediğin bağlantıyı yapıştır.</h1>
          <p>YouTube, M3U8 veya doğrudan video bağlantısı yeterli.</p>
        </div>
        <span
          className={`player-ready-chip player-state-chip player-state-chip--${state}`}
          aria-live="polite"
        >
          {statusLabel}
        </span>
      </div>

      <form
        className="player-source-form simple-watch-source-form"
        onSubmit={(event) => {
          event.preventDefault()
          void openSource()
        }}
      >
        <label className="simple-watch-url-label" htmlFor="player-source-url">
          Medya URL’si
        </label>
        <div className="player-source-input-row">
          <input
            id="player-source-url"
            type="url"
            value={url}
            placeholder="https://…"
            autoComplete="off"
            inputMode="url"
            onChange={(event) => setUrl(event.target.value)}
          />
          <button
            className="player-open-button"
            type="submit"
            disabled={!url.trim() || state === 'loading'}
          >
            {state === 'loading' ? 'Yükleniyor…' : 'Yükle ve İzle'}
          </button>
        </div>
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
            <strong>Bağlantıyı yükle, gerisini LiveTV halletsin.</strong>
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
    </section>
  )
}
