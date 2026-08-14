import { useEffect, useState } from 'react'

import type { YouTubeEmbedMode } from '../player/player-config'
import {
  readYouTubeEmbedMode,
  writeYouTubeEmbedMode,
  YOUTUBE_EMBED_MODE_EVENT,
} from '../player/youtube-session'
import { AppIcon } from './AppIcon'
import { PwaStatus } from './PwaStatus'

type ThemeMode = 'system' | 'dark' | 'light'
type StartupMode = 'home' | 'last' | 'default'

const themeOptions: readonly { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'Sistem' },
  { value: 'dark', label: 'Koyu' },
  { value: 'light', label: 'Açık' },
]

const startupOptions: readonly {
  value: StartupMode
  title: string
  description: string
}[] = [
  {
    value: 'home',
    title: 'Ana ekranı aç',
    description: 'Her başlangıçta LiveTV ana sayfasına dön.',
  },
  {
    value: 'last',
    title: 'Son izlediğim kaynağı aç',
    description: 'Son oturumu hazırla; autoplay engellenirse oynatmayı beklet.',
  },
  {
    value: 'default',
    title: 'Varsayılan kaynağı aç',
    description: 'Daha sonra belirleyeceğin sabit kaynağa git.',
  },
]

export function SettingsShell() {
  const [theme, setTheme] = useState<ThemeMode>('system')
  const [startup, setStartup] = useState<StartupMode>('home')
  const [youtubeEmbedMode, setYoutubeEmbedMode] =
    useState<YouTubeEmbedMode>('premium-session')

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
    if (typeof document === 'undefined' || typeof window === 'undefined') return

    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: light)')

    const applyTheme = () => {
      root.dataset.theme =
        theme === 'system' ? (media.matches ? 'light' : 'dark') : theme
    }

    applyTheme()

    if (theme === 'system') media.addEventListener('change', applyTheme)

    return () => {
      media.removeEventListener('change', applyTheme)
    }
  }, [theme])

  return (
    <div className="settings-shell">
      <section className="settings-card settings-card--hero">
        <div className="settings-card-icon">
          <AppIcon name="settings" size={26} />
        </div>
        <div>
          <span className="eyebrow">Kişiselleştir</span>
          <h2>LiveTV sana göre çalışsın</h2>
          <p>
            P4’te görünüm, başlangıç davranışı, YouTube oturum tercihi,
            cihazdaki guest kütüphanesi ve IPTV/M3U kütüphanesi çalışır. Hesap
            ve cihazlar arası senkronizasyon sonraki veri fazında eklenecek.
          </p>
        </div>
      </section>

      <div className="settings-grid">
        <section className="settings-card">
          <div className="settings-section-heading">
            <span className="settings-section-icon" aria-hidden="true">
              ◐
            </span>
            <div>
              <h3>Görünüm ve tema</h3>
              <p>Arayüz kontrastını bulunduğun ortama göre değiştir.</p>
            </div>
          </div>

          <div className="segmented-control" aria-label="Tema seçimi">
            {themeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={theme === option.value}
                className={theme === option.value ? 'is-selected' : undefined}
                onClick={() => setTheme(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="settings-card">
          <div className="settings-section-heading">
            <span className="settings-section-icon" aria-hidden="true">
              ↗
            </span>
            <div>
              <h3>Başlangıç davranışı</h3>
              <p>
                Uygulama açıldığında hangi çalışma alanıyla başlayacağını seç.
              </p>
            </div>
          </div>

          <fieldset className="startup-options">
            <legend className="sr-only">Başlangıç davranışı seçimi</legend>
            {startupOptions.map((option) => (
              <label
                key={option.value}
                className={`startup-option${startup === option.value ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="startup-mode"
                  value={option.value}
                  checked={startup === option.value}
                  onChange={() => setStartup(option.value)}
                />
                <span className="radio-dot" aria-hidden="true" />
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="settings-card settings-card--wide youtube-account-settings">
          <div className="settings-section-heading">
            <span className="settings-section-icon" aria-hidden="true">
              ▶
            </span>
            <div>
              <h3>YouTube hesabı ve Premium</h3>
              <p>
                Tarayıcıdaki mevcut YouTube oturumunu embed oynatıcıyla
                paylaşmayı dene. Premium üyelik oturum tarafından tanınırsa
                YouTube reklamları gösterilmez.
              </p>
            </div>
          </div>

          <div className="youtube-account-mode-row">
            <div>
              <span className="source-status">Önerilen</span>
              <strong>YouTube oturumunu kullan</strong>
              <small>
                Normal youtube.com embed kullanılır. Tarayıcı üçüncü taraf
                oturum çerezlerini engelliyorsa Premium tanınmayabilir; bu
                durumda oynatıcı içindeki “YouTube’da aç” bağlantısını
                kullanabilirsin.
              </small>
            </div>

            <label className="settings-toggle">
              <input
                id="settings-youtube-premium-session"
                name="settings-youtube-premium-session"
                type="checkbox"
                checked={youtubeEmbedMode === 'premium-session'}
                onChange={(event) => {
                  const mode: YouTubeEmbedMode = event.target.checked
                    ? 'premium-session'
                    : 'privacy'
                  setYoutubeEmbedMode(mode)
                  writeYouTubeEmbedMode(mode)
                }}
              />
              <span className="toggle-track" aria-hidden="true">
                <span />
              </span>
              <span>
                {youtubeEmbedMode === 'premium-session'
                  ? 'Açık'
                  : 'Gizlilik modu'}
              </span>
            </label>
          </div>
        </section>

        <section className="settings-card settings-card--wide">
          <div className="settings-section-heading">
            <span className="settings-section-icon" aria-hidden="true">
              ⤓
            </span>
            <div>
              <h3>Uygulama ve PWA</h3>
              <p>
                LiveTV normal web uygulaması olarak çalışır; desteklenen
                tarayıcılarda ayrı uygulama gibi kurulabilir.
              </p>
            </div>
          </div>

          <div className="pwa-settings-preview">
            <div>
              <span className="source-status">Web uygulaması</span>
              <strong>Kurulum durumu tarayıcıdan okunacak</strong>
              <small>
                Service Worker yalnız uygulama kabuğunu cache’leyecek; medya
                içerikleri offline arşivlenmeyecek.
              </small>
            </div>
            <PwaStatus />
          </div>
        </section>
      </div>
    </div>
  )
}
