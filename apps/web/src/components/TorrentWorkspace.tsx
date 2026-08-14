import { useEffect, useRef, useState } from 'react'

import {
  useTorrent,
  type TorrentContextValue,
} from '../torrent/torrent-context'
import type { TorrentPlaybackDescriptor } from '../torrent/torrent-controller'
import type { TorrentReplayRequest } from '../torrent/torrent-replay'
import type { TorrentFileDescriptor } from '../torrent/torrent-types'
import { AppIcon } from './AppIcon'

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0 B'
  const units = ['B', 'kB', 'MB', 'GB', 'TB'] as const
  let amount = value
  let index = 0
  while (amount >= 1000 && index < units.length - 1) {
    amount /= 1000
    index += 1
  }
  return `${amount.toFixed(index === 0 ? 0 : 1)} ${units[index]}`
}

function formatSpeed(value: number) {
  return `${formatBytes(value)}/s`
}

function formatRemaining(value: number) {
  if (!Number.isFinite(value) || value < 0) return '—'
  const seconds = Math.ceil(value / 1000)
  if (seconds < 60) return `${seconds} sn`
  const minutes = Math.ceil(seconds / 60)
  return minutes < 60 ? `${minutes} dk` : `${Math.ceil(minutes / 60)} sa`
}

function statusLabel(status: TorrentContextValue['status']) {
  switch (status) {
    case 'idle':
      return 'Kaynak bekleniyor'
    case 'initializing':
      return 'WebTorrent hazırlanıyor'
    case 'metadata':
      return 'Metadata ve eşler aranıyor'
    case 'ready':
      return 'Dosyalar hazır'
    case 'streaming':
      return 'Torrent akışı hazır'
    case 'error':
      return 'Torrent hatası'
  }
}

type TorrentWorkspaceViewProps = {
  torrent: TorrentContextValue
  sourceInput: string
  actionPending: boolean
  actionError?: string | null
  onSourceInputChange(value: string): void
  onOpenSource(): void
  onOpenFile(file: File): void
  onSelectFile(file: TorrentFileDescriptor): void
  onStop(): void
}

export function TorrentWorkspaceView({
  torrent,
  sourceInput,
  actionPending,
  actionError = null,
  onSourceInputChange,
  onOpenSource,
  onOpenFile,
  onSelectFile,
  onStop,
}: TorrentWorkspaceViewProps) {
  const sessionActive = torrent.status !== 'idle'

  return (
    <aside
      className="context-panel torrent-workspace"
      aria-label="Torrent çalışma alanı"
    >
      <div className="context-heading torrent-heading">
        <span className="eyebrow">P5 · Browser WebTorrent</span>
        <h2>Torrent akışı</h2>
        <p>
          Magnet veya .torrent metadata’sını aç; medya dosyasını aynı LiveTV
          oynatıcısında izle.
        </p>
      </div>

      <section className="torrent-disclosure-card" aria-label="P2P davranışı">
        <AppIcon name="torrent" size={20} />
        <div>
          <strong>Tarayıcı WebTorrent, WebRTC eşleriyle çalışır</strong>
          <p>
            Normal TCP/UDP BitTorrent eşleri görünmeyebilir. Aktif P2P oturumu
            protokol gereği eşlere parça yükleme yapabilir. LiveTV
            Durdur/temizle sonrasında kalıcı torrent arşivi tutmaz.
          </p>
        </div>
      </section>

      <section className="torrent-source-card" aria-label="Torrent kaynağı">
        <form
          className="torrent-source-form"
          onSubmit={(event) => {
            event.preventDefault()
            onOpenSource()
          }}
        >
          <label htmlFor="torrent-source-input">
            Magnet veya .torrent URL’si
          </label>
          <div className="torrent-source-row">
            <input
              id="torrent-source-input"
              value={sourceInput}
              placeholder="magnet:?xt=urn:btih:… veya https://…/file.torrent"
              onChange={(event) => onSourceInputChange(event.target.value)}
            />
            <button
              type="submit"
              disabled={!sourceInput.trim() || actionPending}
            >
              Torrent’i aç
            </button>
          </div>
        </form>

        <label className="torrent-file-input">
          <span>Yerel .torrent dosyası</span>
          <input
            type="file"
            accept=".torrent,application/x-bittorrent"
            disabled={actionPending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) onOpenFile(file)
            }}
          />
        </label>

        {sessionActive ? (
          <button
            className="torrent-stop-button"
            type="button"
            disabled={actionPending}
            onClick={onStop}
          >
            Durdur ve temizle
          </button>
        ) : null}
      </section>

      <section
        className="torrent-session-card"
        aria-label="Torrent oturum durumu"
      >
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Oturum</span>
            <h3>{torrent.torrentName ?? statusLabel(torrent.status)}</h3>
          </div>
          <span
            className={`source-status torrent-status torrent-status--${torrent.status}`}
          >
            {statusLabel(torrent.status)}
          </span>
        </div>

        {torrent.infoHash ? (
          <small className="torrent-info-hash">{torrent.infoHash}</small>
        ) : null}

        <div className="torrent-stat-grid">
          <span>
            <strong>{torrent.numPeers} eş</strong>
            <small>WebRTC peer</small>
          </span>
          <span>
            <strong>{Math.round(torrent.progress * 100)}%</strong>
            <small>İlerleme</small>
          </span>
          <span>
            <strong>{formatSpeed(torrent.downloadSpeed)}</strong>
            <small>İndirme</small>
          </span>
          <span>
            <strong>{formatSpeed(torrent.uploadSpeed)}</strong>
            <small>Yükleme</small>
          </span>
          <span>
            <strong>{formatBytes(torrent.downloaded)}</strong>
            <small>Alındı</small>
          </span>
          <span>
            <strong>{formatBytes(torrent.uploaded)}</strong>
            <small>Gönderildi</small>
          </span>
          <span>
            <strong>{formatRemaining(torrent.timeRemaining)}</strong>
            <small>Kalan</small>
          </span>
        </div>

        {torrent.warningMessage ? (
          <p className="torrent-message is-warning" role="status">
            {torrent.warningMessage}
          </p>
        ) : null}
        {torrent.errorMessage || actionError ? (
          <p className="torrent-message is-error" role="alert">
            {actionError ?? torrent.errorMessage}
          </p>
        ) : null}
      </section>

      {torrent.files.length > 0 ? (
        <section className="torrent-files-card" aria-label="Torrent dosyaları">
          <div className="section-title-row">
            <div>
              <span className="eyebrow">Dosyalar</span>
              <h3>{torrent.files.length} dosya</h3>
            </div>
          </div>
          <div className="torrent-file-list">
            {torrent.files.map((file) => {
              const playable = file.mediaType !== 'unsupported'
              return (
                <article className="torrent-file-row" key={file.path}>
                  <div className="torrent-file-copy">
                    <strong>{file.name}</strong>
                    <small>{file.path}</small>
                    <small>
                      {formatBytes(file.size)} ·{' '}
                      {Math.round(file.progress * 100)}%
                    </small>
                  </div>
                  {playable ? (
                    <button
                      type="button"
                      disabled={actionPending}
                      onClick={() => onSelectFile(file)}
                    >
                      Oynat
                    </button>
                  ) : (
                    <button type="button" disabled>
                      Tarayıcıda oynatılamaz
                    </button>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
    </aside>
  )
}

export function TorrentWorkspace({
  onPlayDescriptor = () => {},
  replayRequest = null,
}: {
  onPlayDescriptor?: (descriptor: TorrentPlaybackDescriptor) => void
  replayRequest?: TorrentReplayRequest | null
}) {
  const torrent = useTorrent()
  const consumedReplayIdRef = useRef<number | null>(null)
  const [sourceInput, setSourceInput] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const run = async (operation: () => Promise<void>) => {
    setActionPending(true)
    setActionError(null)
    try {
      await operation()
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Torrent işlemi başarısız.',
      )
    } finally {
      setActionPending(false)
    }
  }

  const playFile = async (file: TorrentFileDescriptor) => {
    const descriptor = await torrent.selectFile(file.path)
    onPlayDescriptor(descriptor)
  }

  useEffect(() => {
    if (!replayRequest || consumedReplayIdRef.current === replayRequest.id) {
      return
    }
    consumedReplayIdRef.current = replayRequest.id
    setSourceInput(replayRequest.magnetUri)
    setActionPending(true)
    setActionError(null)
    void torrent
      .replaySource(replayRequest.magnetUri, replayRequest.filePath)
      .then(onPlayDescriptor)
      .catch((error: unknown) => {
        setActionError(
          error instanceof Error ? error.message : 'Torrent tekrar açılamadı.',
        )
      })
      .finally(() => setActionPending(false))
  }, [onPlayDescriptor, replayRequest, torrent])

  return (
    <TorrentWorkspaceView
      torrent={torrent}
      sourceInput={sourceInput}
      actionPending={actionPending}
      actionError={actionError}
      onSourceInputChange={setSourceInput}
      onOpenSource={() =>
        void run(() => torrent.openTextSource(sourceInput.trim()))
      }
      onOpenFile={(file) => void run(() => torrent.openTorrentFile(file))}
      onSelectFile={(file) => void run(() => playFile(file))}
      onStop={() => void run(() => torrent.stop())}
    />
  )
}
