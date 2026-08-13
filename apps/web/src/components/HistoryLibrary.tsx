import type { LibraryContextValue } from '../library/library-context'
import { useLibrary } from '../library/library-context'
import type { LibrarySource } from '../library/library-types'
import { AppIcon } from './AppIcon'

type HistoryLibraryProps = {
  onPlaySource: (source: LibrarySource) => void
}

type HistoryLibraryViewProps = HistoryLibraryProps & {
  library: LibraryContextValue
}

const kindLabels: Record<LibrarySource['kind'], string> = {
  youtube: 'YouTube',
  hls: 'HLS',
  video: 'Video',
  audio: 'Ses',
}

export function HistoryLibraryView({
  library,
  onPlaySource,
}: HistoryLibraryViewProps) {
  if (library.status === 'unavailable') {
    return (
      <aside className="context-panel local-library-panel" aria-label="Geçmiş">
        <div className="library-unavailable" role="status">
          <strong>Yerel kütüphane kullanılamıyor</strong>
          <p>
            Oynatma çalışmaya devam eder; bu tarayıcı yerel kayıt erişimini
            engelliyor.
          </p>
        </div>
      </aside>
    )
  }

  if (library.status === 'loading') {
    return (
      <aside className="context-panel local-library-panel" aria-label="Geçmiş">
        <div className="library-unavailable" role="status">
          <strong>Geçmiş yükleniyor…</strong>
        </div>
      </aside>
    )
  }

  return (
    <aside className="context-panel local-library-panel" aria-label="Geçmiş">
      <div className="context-heading local-library-heading">
        <span className="eyebrow">Cihazda saklanır</span>
        <h2>İzleme geçmişi</h2>
        <p>Gerçekten oynatılan son 200 kaynağa hızlıca geri dön.</p>
      </div>

      <div className="library-section-title">
        <span>{library.history.length} kayıt</span>
        <button
          type="button"
          disabled={library.history.length === 0}
          onClick={() => void library.clearHistory()}
        >
          Geçmişi temizle
        </button>
      </div>

      {library.history.length === 0 ? (
        <div className="empty-library">
          <span className="empty-library-icon">
            <AppIcon name="history" size={21} />
          </span>
          <p>Henüz oynatılmış bir kaynak yok.</p>
        </div>
      ) : (
        <div className="library-entry-list">
          {library.history.map((entry) => {
            const favorite = library.favorites.some(
              ({ sourceKey }) => sourceKey === entry.sourceKey,
            )

            return (
              <article className="library-entry" key={entry.sourceKey}>
                <div className="library-entry-copy">
                  <span className="source-status">
                    {kindLabels[entry.kind]}
                  </span>
                  <strong>{entry.title}</strong>
                  <small>{entry.playCount} kez oynatıldı</small>
                </div>
                <div className="library-entry-actions">
                  <button type="button" onClick={() => onPlaySource(entry)}>
                    Tekrar oynat
                  </button>
                  <button
                    type="button"
                    onClick={() => void library.toggleFavorite(entry)}
                  >
                    {favorite ? 'Favoriden çıkar' : 'Favoriye ekle'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void library.removeHistory(entry.sourceKey)}
                  >
                    Kaydı sil
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </aside>
  )
}

export function HistoryLibrary({ onPlaySource }: HistoryLibraryProps) {
  return (
    <HistoryLibraryView library={useLibrary()} onPlaySource={onPlaySource} />
  )
}
