import type { IptvChannel } from '../iptv/iptv-repository'
import type { NavigationItem } from '../navigation'
import type { LibrarySource } from '../library/library-types'
import { AppIcon } from './AppIcon'
import { HistoryLibrary } from './HistoryLibrary'
import { IptvLibrary } from './IptvLibrary'
import { PlaylistsLibrary } from './PlaylistsLibrary'

type RouteContentProps = {
  route: NavigationItem
  onNavigate: (path: string) => void
  onPlaySource?: (source: LibrarySource) => void
  onPlayIptvChannel?: (channel: IptvChannel) => void
}

const sourceHints: Record<
  NavigationItem['id'],
  { title: string; hint: string; action: string }
> = {
  home: {
    title: 'Kaldığın yerden devam et',
    hint: 'Son kaynaklara ve cihazındaki kişisel kütüphaneye geri dön.',
    action: 'Kaynak seç',
  },
  live: {
    title: 'Canlı yayın kaynağı',
    hint: 'HLS veya doğrudan canlı yayın URL’sini unified player’a gönder.',
    action: 'Canlı kaynak ekle',
  },
  youtube: {
    title: 'YouTube bağlantısı',
    hint: 'Video URL’sini veya kanal @handle adresini unified player’da aç.',
    action: 'YouTube bağlantısı ekle',
  },
  iptv: {
    title: 'M3U / M3U8 listesi',
    hint: 'M3U kanal listelerini içe aktar, cihazda sakla ve kanalları oynat.',
    action: 'IPTV listesi ekle',
  },
  torrent: {
    title: 'Magnet bağlantısı',
    hint: 'Tarayıcı öncelikli torrent streaming kaynağı bu alandan başlatılacak.',
    action: 'Torrent kaynağı ekle',
  },
  playlists: {
    title: 'Karışık playlistler',
    hint: 'Farklı kaynak türlerini aynı listede sıralayabileceksin.',
    action: 'Playlist oluştur',
  },
  guide: {
    title: 'TV rehberi',
    hint: 'XMLTV verisi bağlandığında şimdi ve sıradaki programlar burada görünecek.',
    action: 'Rehberi aç',
  },
  history: {
    title: 'İzleme geçmişi',
    hint: 'Son oynatılan kaynaklar ve devam noktaları burada tutulacak.',
    action: 'Geçmişi görüntüle',
  },
  settings: {
    title: 'LiveTV ayarları',
    hint: 'Görünüm, başlangıç ve uygulama tercihleri bu alanda toplanacak.',
    action: 'Ayarları düzenle',
  },
}

const quickRoutes = [
  { id: 'live', path: '/live' },
  { id: 'youtube', path: '/youtube' },
  { id: 'iptv', path: '/iptv' },
  { id: 'torrent', path: '/torrent' },
] as const

function HomeContent({ onNavigate }: Pick<RouteContentProps, 'onNavigate'>) {
  return (
    <>
      <div className="context-heading">
        <span className="eyebrow">Hızlı başlangıç</span>
        <h2>Ne izlemek istersin?</h2>
        <p>Kaynak türünü seç; LiveTV çalışma alanını ona göre hazırlasın.</p>
      </div>

      <div className="quick-source-grid">
        {quickRoutes.map(({ id, path }) => {
          const labels = {
            live: ['Canlı TV', 'Canlı yayın'],
            youtube: ['YouTube', 'Video / canlı'],
            iptv: ['IPTV', 'M3U listesi'],
            torrent: ['Torrent', 'Magnet akışı'],
          } as const

          return (
            <button
              key={id}
              className={`quick-source-card quick-source-card--${id}`}
              type="button"
              onClick={() => onNavigate(path)}
            >
              <span className="quick-source-icon">
                <AppIcon name={id} size={24} />
              </span>
              <span>
                <strong>{labels[id][0]}</strong>
                <small>{labels[id][1]}</small>
              </span>
              <span className="quick-arrow" aria-hidden="true">
                →
              </span>
            </button>
          )
        })}
      </div>

      <section className="continue-card">
        <div className="continue-icon" aria-hidden="true">
          <AppIcon name="history" size={20} />
        </div>
        <div>
          <strong>Henüz izleme geçmişi yok</strong>
          <p>İlk kaynağını oynattığında kaldığın yer burada görünecek.</p>
        </div>
      </section>
    </>
  )
}

function SourceContent({ route }: { route: NavigationItem }) {
  const content = sourceHints[route.id]
  const supportsPlayback = ['live', 'youtube', 'iptv'].includes(route.id)

  const focusPlayerInput = () => {
    document.getElementById('player-source-url')?.focus()
  }

  return (
    <>
      <div className="context-heading">
        <span className="eyebrow">{route.label}</span>
        <h2>{content.title}</h2>
        <p>{content.hint}</p>
      </div>

      <section className="source-entry-card">
        <div className="source-entry-icon">
          <AppIcon name={route.icon} size={27} />
        </div>
        <div className="source-entry-copy">
          <span className="source-status">
            {supportsPlayback ? 'P4 oynatma + kütüphane hazır' : 'Arayüz hazır'}
          </span>
          <strong>{content.action}</strong>
          <p>
            {supportsPlayback
              ? 'URL alanına geç; LiveTV kaynağı otomatik algılar veya motoru elle seçmene izin verir.'
              : 'Bu bölümün veri motoru ilgili yol haritası fazında bağlanacak.'}
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={!supportsPlayback}
          onClick={supportsPlayback ? focusPlayerInput : undefined}
        >
          {supportsPlayback ? 'Oynatıcıda aç' : 'Yakında'}
        </button>
      </section>

      <section className="library-preview-card">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Kütüphane</span>
            <h3>Kaydedilenler</h3>
          </div>
          <span className="count-chip">0</span>
        </div>

        <div className="empty-library">
          <span className="empty-library-icon">
            <AppIcon name="playlists" size={21} />
          </span>
          <p>Bu bölümde henüz kayıtlı kaynak yok.</p>
        </div>
      </section>
    </>
  )
}

export function RouteContent({
  route,
  onNavigate,
  onPlaySource = () => {},
  onPlayIptvChannel = () => {},
}: RouteContentProps) {
  if (route.id === 'history') {
    return <HistoryLibrary onPlaySource={onPlaySource} />
  }

  if (route.id === 'playlists') {
    return <PlaylistsLibrary onPlaySource={onPlaySource} />
  }

  if (route.id === 'iptv') {
    return <IptvLibrary onPlayChannel={onPlayIptvChannel} />
  }

  return (
    <aside
      className="context-panel"
      aria-label={`${route.label} bağlam paneli`}
    >
      {route.id === 'home' ? (
        <HomeContent onNavigate={onNavigate} />
      ) : (
        <SourceContent route={route} />
      )}
    </aside>
  )
}
