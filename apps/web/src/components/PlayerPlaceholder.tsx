import type { NavigationItem } from '../navigation'
import { AppIcon } from './AppIcon'

export function PlayerPlaceholder({ route }: { route: NavigationItem }) {
  return (
    <section className="player-card" aria-label="LiveTV oynatıcı alanı">
      <div className="player-toolbar">
        <div className="player-source">
          <span className="player-source-icon">
            <AppIcon name={route.icon} size={19} />
          </span>
          <span>
            <small>Aktif kaynak</small>
            <strong>{route.label}</strong>
          </span>
        </div>
        <span className="player-ready-chip">Oynatıcı hazır</span>
      </div>

      <div className="player-viewport">
        <div className="player-glow player-glow-one" aria-hidden="true" />
        <div className="player-glow player-glow-two" aria-hidden="true" />
        <div className="player-empty-state">
          <span className="empty-play-button" aria-hidden="true">
            <span />
          </span>
          <strong>Kaynak seçildiğinde oynatıcı burada açılacak</strong>
          <p>
            LiveTV aynı oynatıcı yüzeyinde farklı yayın türlerini yönetecek.
          </p>
        </div>

        <div className="mock-player-controls" aria-hidden="true">
          <span className="mock-control-play" />
          <span className="mock-progress">
            <span />
          </span>
          <span className="mock-control-dot" />
          <span className="mock-control-square" />
        </div>
      </div>

      <div className="player-footer">
        <div>
          <span className="footer-label">Oturum</span>
          <strong>Yeni kaynak bekleniyor</strong>
        </div>
        <div className="player-metrics" aria-label="Oynatıcı durum özeti">
          <span>0:00</span>
          <span>Auto</span>
          <span>—</span>
        </div>
      </div>
    </section>
  )
}
