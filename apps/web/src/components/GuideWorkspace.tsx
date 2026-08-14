import { type ChangeEvent, useEffect, useRef, useState } from 'react'

import { useGuide, type GuideContextValue } from '../guide/guide-context'
import type { GuideProgramme } from '../guide/guide-types'
import { useIptv, type IptvContextValue } from '../iptv/iptv-context'
import type { IptvChannel } from '../iptv/iptv-repository'
import { AppIcon } from './AppIcon'

type GuideWorkspaceViewProps = {
  guide: GuideContextValue
  iptv: IptvContextValue
  now: number
  actionPending?: boolean
  actionError?: string | null
  onSelectList: (id: string | null) => void
  onRefresh: () => void
  onRefreshUrls: () => void
  onFileChange: (file: File) => void
  onSelectDate: (dateKey: string) => void
  onPlayChannel: (channel: IptvChannel) => void
}

function localDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function guideDates(now: number) {
  const today = new Date(now)
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + offset,
    )
    return {
      key: localDateKey(date),
      label:
        offset === 0
          ? 'Bugün'
          : new Intl.DateTimeFormat('tr-TR', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            }).format(date),
    }
  })
}

function formatTime(epoch: number) {
  return new Intl.DateTimeFormat('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(epoch))
}

function formatUpdatedAt(epoch: number | undefined) {
  if (epoch === undefined) return 'Henüz yüklenmedi'
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(epoch))
}

function ProgrammeDetails({ programme }: { programme: GuideProgramme }) {
  return (
    <details className="guide-programme-detail">
      <summary>
        <span>{formatTime(programme.startAt)}</span>
        <strong>{programme.title}</strong>
        <small>{formatTime(programme.stopAt)}</small>
      </summary>
      <div>
        {programme.subTitle ? <strong>{programme.subTitle}</strong> : null}
        {programme.description ? <p>{programme.description}</p> : null}
        {programme.categories.length > 0 ? (
          <small>{programme.categories.join(' · ')}</small>
        ) : null}
      </div>
    </details>
  )
}

export function GuideWorkspaceView({
  guide,
  iptv,
  now,
  actionPending = false,
  actionError = null,
  onSelectList,
  onRefresh,
  onRefreshUrls,
  onFileChange,
  onSelectDate,
  onPlayChannel,
}: GuideWorkspaceViewProps) {
  if (guide.status === 'loading' || iptv.status === 'loading') {
    return (
      <aside className="context-panel guide-workspace" aria-label="TV rehberi">
        <div className="library-unavailable" role="status">
          <strong>TV rehberi yükleniyor…</strong>
          <p>IPTV listeleri ve cihazdaki EPG önbelleği hazırlanıyor.</p>
        </div>
      </aside>
    )
  }

  if (guide.status === 'unavailable') {
    return (
      <aside className="context-panel guide-workspace" aria-label="TV rehberi">
        <div className="library-unavailable" role="status">
          <strong>TV rehberi kullanılamıyor</strong>
          <p>
            {guide.errorMessage ??
              'Yerel EPG önbelleği açılamadı. IPTV oynatma çalışmaya devam eder.'}
          </p>
        </div>
      </aside>
    )
  }

  if (iptv.lists.length === 0) {
    return (
      <aside className="context-panel guide-workspace" aria-label="TV rehberi">
        <div className="context-heading guide-heading">
          <span className="eyebrow">P6 · XMLTV TV Guide</span>
          <h2>Önce bir IPTV listesi ekle</h2>
          <p>
            TV rehberi P4 kanal listelerini kullanır. Önce{' '}
            <a href="/iptv">/iptv</a> bölümünden bir M3U listesi içe aktar.
          </p>
        </div>
      </aside>
    )
  }

  const activeList =
    iptv.lists.find(({ id }) => id === iptv.activeListId) ??
    iptv.lists[0] ??
    null
  const dates = guideDates(now)
  const hasDeclaredUrls = Boolean(activeList?.epgUrls.length)

  return (
    <aside className="context-panel guide-workspace" aria-label="TV rehberi">
      <div className="context-heading guide-heading">
        <span className="eyebrow">P6 · XMLTV TV Guide</span>
        <h2>TV rehberi</h2>
        <p>
          Şimdi, sıradaki ve yedi günlük program akışını kanallarınla eşleştir.
        </p>
      </div>

      <section className="guide-source-card" aria-label="EPG kaynağı">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Kaynak</span>
            <h3>{activeList?.name ?? 'IPTV listesi'}</h3>
          </div>
          <span className="count-chip">{guide.channels.length}</span>
        </div>

        <label className="iptv-field">
          <span>Rehber listesi</span>
          <select
            name="guide-list"
            value={iptv.activeListId ?? ''}
            disabled={actionPending}
            onChange={(event) => onSelectList(event.target.value || null)}
          >
            {iptv.lists.map((storedList) => (
              <option key={storedList.id} value={storedList.id}>
                {storedList.name}
              </option>
            ))}
          </select>
        </label>

        <div className="guide-source-summary">
          <div>
            <strong>
              {guide.sourceMode === 'file'
                ? 'Dosyadan yüklenen rehber'
                : hasDeclaredUrls
                  ? `${activeList?.epgUrls.length ?? 0} XMLTV adresi`
                  : 'XMLTV adresi tanımlı değil'}
            </strong>
            <small>Son güncelleme: {formatUpdatedAt(guide.fetchedAt)}</small>
          </div>
          <div className="guide-actions">
            {hasDeclaredUrls ? (
              <button
                type="button"
                disabled={actionPending || guide.refreshing}
                onClick={
                  guide.sourceMode === 'file' ? onRefreshUrls : onRefresh
                }
              >
                {guide.sourceMode === 'file' ? 'URL’lerden yenile' : 'Yenile'}
              </button>
            ) : null}
            <label className="guide-file-button">
              <span>XMLTV dosyası seç</span>
              <input
                type="file"
                name="guide-xmltv-file"
                aria-label="XMLTV dosyası seç"
                accept=".xml,.xmltv,.xml.gz,.xmltv.gz,.gz,application/xml,text/xml,application/gzip"
                disabled={actionPending}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const file = event.target.files?.[0]
                  if (file) onFileChange(file)
                }}
              />
            </label>
          </div>
        </div>

        {!hasDeclaredUrls && guide.sourceMode !== 'file' ? (
          <p className="guide-notice">
            Seçili IPTV listesinde XMLTV adresi tanımlı değil. Yerel XMLTV
            dosyası yükleyebilirsin.
          </p>
        ) : null}
        {guide.refreshing ? (
          <p className="guide-notice" role="status">
            Rehber yenileniyor… mevcut programlar ekranda kalır.
          </p>
        ) : null}
        {guide.warningMessage || guide.errorMessage || actionError ? (
          <p className="guide-notice is-warning" role="alert">
            {actionError ?? guide.warningMessage ?? guide.errorMessage}
          </p>
        ) : null}
      </section>

      <nav className="guide-date-strip" aria-label="Rehber günleri">
        {dates.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            className={`guide-date-button${guide.selectedDate === key ? ' is-selected' : ''}`}
            aria-pressed={guide.selectedDate === key}
            onClick={() => onSelectDate(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      <section className="guide-channel-card" aria-label="TV programları">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Programlar</span>
            <h3>{guide.channels.length} kanal</h3>
          </div>
          {guide.unmatchedChannelCount > 0 ? (
            <span className="count-chip">
              {guide.unmatchedChannelCount} EPG yok
            </span>
          ) : null}
        </div>

        {guide.channels.length === 0 ? (
          <div className="empty-library">
            <p>
              {guide.fetchedAt
                ? 'Bu IPTV listesinde gösterilecek kanal bulunamadı.'
                : 'Henüz rehber verisi yüklenmedi.'}
            </p>
          </div>
        ) : (
          <div className="guide-channel-list">
            {guide.channels.map((row) => (
              <article className="guide-channel-row" key={row.channel.id}>
                <header className="guide-channel-header">
                  <div className="guide-channel-logo" aria-hidden="true">
                    {row.channel.logoUrl ? (
                      <img src={row.channel.logoUrl} alt="" loading="lazy" />
                    ) : (
                      <AppIcon name="guide" size={19} />
                    )}
                  </div>
                  <div className="guide-channel-name">
                    <strong>{row.channel.name}</strong>
                    <small>
                      {row.match === 'none' ? 'EPG yok' : 'EPG eşleşti'}
                    </small>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPlayChannel(row.channel)}
                  >
                    Kanalı oynat
                  </button>
                </header>

                <div className="guide-now-next">
                  <div>
                    <span>Şimdi</span>
                    <strong>
                      {row.current?.title ?? 'Program bilgisi yok'}
                    </strong>
                    {row.current ? (
                      <small>
                        {formatTime(row.current.startAt)}–
                        {formatTime(row.current.stopAt)}
                      </small>
                    ) : null}
                    {row.progress !== null ? (
                      <progress max={1} value={row.progress}>
                        {Math.round(row.progress * 100)}%
                      </progress>
                    ) : null}
                  </div>
                  <div>
                    <span>Sıradaki</span>
                    <strong>{row.next?.title ?? 'Program bilgisi yok'}</strong>
                    {row.next ? (
                      <small>{formatTime(row.next.startAt)}</small>
                    ) : null}
                  </div>
                </div>

                {row.programmes.length > 0 ? (
                  <div className="guide-programme-list">
                    {row.programmes.map((programme) => (
                      <ProgrammeDetails
                        key={programme.id}
                        programme={programme}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="guide-empty-day">
                    {row.match === 'none'
                      ? 'EPG yok; kanal yine oynatılabilir.'
                      : 'Seçili gün için program bulunamadı.'}
                  </p>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </aside>
  )
}

export function GuideWorkspace({
  onPlayChannel,
}: {
  onPlayChannel: (channel: IptvChannel) => void
}) {
  const guide = useGuide()
  const iptv = useIptv()
  const initializeRef = useRef(guide.initialize)
  const tickRef = useRef(guide.tick)
  tickRef.current = guide.tick
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    void initializeRef.current().catch((error) => {
      setActionError(
        error instanceof Error ? error.message : 'TV rehberi başlatılamadı.',
      )
    })
  }, [])

  useEffect(() => {
    const timer = globalThis.setInterval(() => tickRef.current(), 60_000)
    return () => globalThis.clearInterval(timer)
  }, [])

  const run = async (operation: () => Promise<void>) => {
    setActionError(null)
    setActionPending(true)
    try {
      await operation()
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'TV rehberi işlemi başarısız.',
      )
    } finally {
      setActionPending(false)
    }
  }

  return (
    <GuideWorkspaceView
      guide={guide}
      iptv={iptv}
      now={Date.now()}
      actionPending={actionPending}
      actionError={actionError}
      onSelectList={(id) => void run(() => guide.selectList(id))}
      onRefresh={() => void run(() => guide.refresh({ force: true }))}
      onRefreshUrls={() =>
        void run(() => guide.refresh({ force: true, switchToUrlMode: true }))
      }
      onFileChange={(file) => void run(() => guide.importFile(file))}
      onSelectDate={guide.selectDate}
      onPlayChannel={onPlayChannel}
    />
  )
}
