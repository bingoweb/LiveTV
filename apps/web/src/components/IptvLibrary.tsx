import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { filterIptvChannels, listIptvGroups } from '../iptv/channel-filter'
import { useIptv, type IptvContextValue } from '../iptv/iptv-context'
import type { IptvChannel } from '../iptv/iptv-repository'
import { AppIcon } from './AppIcon'

const PAGE_SIZE = 200
const ALL_GROUPS = '__all__'

type IptvLibraryViewProps = {
  iptv: IptvContextValue
  query: string
  group: string | null
  visibleLimit: number
  importName: string
  importUrl: string
  pasteText: string
  actionPending?: boolean
  actionMessage?: string | null
  actionError?: string | null
  onQueryChange: (value: string) => void
  onGroupChange: (value: string | null) => void
  onShowMore: () => void
  onSelectList: (id: string | null) => void
  onPlayChannel: (channel: IptvChannel) => void
  onImportNameChange?: (value: string) => void
  onImportUrlChange?: (value: string) => void
  onPasteTextChange?: (value: string) => void
  onImportUrlSubmit?: (event: FormEvent<HTMLFormElement>) => void
  onImportTextSubmit?: (event: FormEvent<HTMLFormElement>) => void
  onFileChange?: (file: File) => void
  onRefreshList?: () => void
  onDeleteList?: () => void
}

function formatUpdatedAt(value: number) {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return '—'
  }
}

export function IptvLibraryView({
  iptv,
  query,
  group,
  visibleLimit,
  importName,
  importUrl,
  pasteText,
  actionPending = false,
  actionMessage = null,
  actionError = null,
  onQueryChange,
  onGroupChange,
  onShowMore,
  onSelectList,
  onPlayChannel,
  onImportNameChange = () => {},
  onImportUrlChange = () => {},
  onPasteTextChange = () => {},
  onImportUrlSubmit = () => {},
  onImportTextSubmit = () => {},
  onFileChange = () => {},
  onRefreshList = () => {},
  onDeleteList = () => {},
}: IptvLibraryViewProps) {
  if (iptv.status === 'loading') {
    return (
      <aside
        className="context-panel iptv-library-panel"
        aria-label="IPTV kütüphanesi"
      >
        <div className="library-unavailable" role="status">
          <strong>IPTV kütüphanesi yükleniyor…</strong>
          <p>Kayıtlı M3U listeleri cihazdan okunuyor.</p>
        </div>
      </aside>
    )
  }

  if (iptv.status === 'unavailable') {
    return (
      <aside
        className="context-panel iptv-library-panel"
        aria-label="IPTV kütüphanesi"
      >
        <div className="library-unavailable" role="status">
          <strong>IPTV kütüphanesi kullanılamıyor</strong>
          <p>
            Yerel kayıt erişimi engelli. Doğrudan yayın URL’si sağdaki
            oynatıcıda çalışmaya devam eder.
          </p>
        </div>
      </aside>
    )
  }

  const activeList =
    iptv.lists.find((list) => list.id === iptv.activeListId) ?? null
  const groups = listIptvGroups(iptv.channels)
  const filteredChannels = filterIptvChannels(iptv.channels, { query, group })
  const visibleChannels = filteredChannels.slice(0, visibleLimit)

  return (
    <aside
      className="context-panel iptv-library-panel"
      aria-label="IPTV kütüphanesi"
    >
      <div className="context-heading iptv-library-heading">
        <span className="eyebrow">P4 · cihazda saklanır</span>
        <h2>IPTV / M3U kütüphanesi</h2>
        <p>Listeyi içe aktar, kanalı bul ve mevcut LiveTV oynatıcısında aç.</p>
      </div>

      <section className="iptv-import-card" aria-label="IPTV listesi içe aktar">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">İçe aktar</span>
            <h3>M3U listesi ekle</h3>
          </div>
          <AppIcon name="iptv" size={20} />
        </div>

        <label className="iptv-field">
          <span>Liste adı (isteğe bağlı)</span>
          <input
            value={importName}
            placeholder="Örn. Haber kanalları"
            onChange={(event) => onImportNameChange(event.target.value)}
          />
        </label>

        <form className="iptv-import-row" onSubmit={onImportUrlSubmit}>
          <label className="sr-only" htmlFor="iptv-import-url">
            M3U liste URL’si
          </label>
          <input
            id="iptv-import-url"
            type="url"
            value={importUrl}
            placeholder="https://…/channels.m3u"
            onChange={(event) => onImportUrlChange(event.target.value)}
          />
          <button type="submit" disabled={!importUrl.trim() || actionPending}>
            URL’den içe aktar
          </button>
        </form>

        <label className="iptv-file-button">
          <span>Dosyadan içe aktar</span>
          <input
            type="file"
            aria-label="M3U dosyası"
            accept=".m3u,.m3u8,text/plain,application/vnd.apple.mpegurl"
            disabled={actionPending}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const file = event.target.files?.[0]
              if (file) onFileChange(file)
            }}
          />
        </label>

        <details className="iptv-paste-import">
          <summary>M3U metnini yapıştır</summary>
          <form onSubmit={onImportTextSubmit}>
            <label className="sr-only" htmlFor="iptv-paste-text">
              M3U metni
            </label>
            <textarea
              id="iptv-paste-text"
              value={pasteText}
              rows={6}
              placeholder="#EXTM3U…"
              onChange={(event) => onPasteTextChange(event.target.value)}
            />
            <button type="submit" disabled={!pasteText.trim() || actionPending}>
              Metni içe aktar
            </button>
          </form>
        </details>

        {actionError || iptv.errorMessage ? (
          <p className="iptv-action-message is-error" role="alert">
            {actionError ?? iptv.errorMessage}
          </p>
        ) : (iptv.noticeMessage ?? actionMessage) ? (
          <p className="iptv-action-message" role="status">
            {iptv.noticeMessage ?? actionMessage}
          </p>
        ) : null}
      </section>

      <section className="iptv-list-card" aria-label="Kayıtlı IPTV listeleri">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">Listeler</span>
            <h3>Kayıtlı kaynaklar</h3>
          </div>
          <span className="count-chip">{iptv.lists.length}</span>
        </div>

        {iptv.lists.length === 0 ? (
          <div className="empty-library">
            <p>Henüz kayıtlı bir IPTV listesi yok.</p>
          </div>
        ) : (
          <>
            <label className="iptv-field">
              <span>Aktif liste</span>
              <select
                value={iptv.activeListId ?? ''}
                onChange={(event) => onSelectList(event.target.value || null)}
              >
                {iptv.lists.map((storedList) => (
                  <option key={storedList.id} value={storedList.id}>
                    {storedList.name}
                  </option>
                ))}
              </select>
            </label>

            {activeList ? (
              <div className="iptv-active-list-summary">
                <div>
                  <strong>{activeList.name}</strong>
                  <small>
                    {activeList.channelCount} kanal · güncelleme{' '}
                    {formatUpdatedAt(activeList.updatedAt)}
                  </small>
                  {activeList.epgUrls.length > 0 ? (
                    <small>
                      {activeList.epgUrls.length} EPG referansı saklandı
                    </small>
                  ) : null}
                </div>
                <div className="iptv-list-actions">
                  {activeList.sourceType === 'url' ? (
                    <button
                      type="button"
                      disabled={actionPending}
                      onClick={onRefreshList}
                    >
                      Listeyi yenile
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={actionPending}
                    onClick={onDeleteList}
                  >
                    Listeyi sil
                  </button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </section>

      {activeList ? (
        <section className="iptv-channel-card" aria-label="IPTV kanalları">
          <div className="section-title-row">
            <div>
              <span className="eyebrow">Kanallar</span>
              <h3>{filteredChannels.length} sonuç</h3>
            </div>
            <span className="count-chip">{activeList.channelCount}</span>
          </div>

          <div className="iptv-channel-filters">
            <label className="iptv-field">
              <span>Kanallarda ara</span>
              <input
                type="search"
                value={query}
                placeholder="Kanal, grup, tvg-id…"
                onChange={(event) => onQueryChange(event.target.value)}
              />
            </label>
            <label className="iptv-field">
              <span>Grup</span>
              <select
                value={group ?? ALL_GROUPS}
                onChange={(event) =>
                  onGroupChange(
                    event.target.value === ALL_GROUPS
                      ? null
                      : event.target.value,
                  )
                }
              >
                <option value={ALL_GROUPS}>Tümü</option>
                {groups.map((groupName) => (
                  <option key={groupName || '__ungrouped__'} value={groupName}>
                    {groupName || 'Grupsuz'}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filteredChannels.length === 0 ? (
            <div className="empty-library">
              <p>Bu filtreyle eşleşen kanal yok.</p>
            </div>
          ) : (
            <div className="iptv-channel-list">
              {visibleChannels.map((channel) => (
                <article className="iptv-channel-row" key={channel.id}>
                  <div className="iptv-channel-logo" aria-hidden="true">
                    {channel.logoUrl ? (
                      <img src={channel.logoUrl} alt="" loading="lazy" />
                    ) : (
                      <AppIcon name="live" size={18} />
                    )}
                  </div>
                  <div className="iptv-channel-copy">
                    <strong>{channel.name}</strong>
                    <small>{channel.groupTitle || 'Grupsuz'}</small>
                  </div>
                  <button type="button" onClick={() => onPlayChannel(channel)}>
                    Oynat
                  </button>
                </article>
              ))}
            </div>
          )}

          {visibleChannels.length < filteredChannels.length ? (
            <button
              className="iptv-show-more"
              type="button"
              onClick={onShowMore}
            >
              Daha fazla göster
            </button>
          ) : null}
        </section>
      ) : null}
    </aside>
  )
}

export function IptvLibrary({
  onPlayChannel,
}: {
  onPlayChannel: (channel: IptvChannel) => void
}) {
  const iptv = useIptv()
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState<string | null>(null)
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE)
  const [importName, setImportName] = useState('')
  const [importUrl, setImportUrl] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    setQuery('')
    setGroup(null)
    setVisibleLimit(PAGE_SIZE)
  }, [iptv.activeListId])

  const run = async (operation: () => Promise<void>, success: string) => {
    setActionPending(true)
    setActionError(null)
    setActionMessage(null)
    try {
      await operation()
      setActionMessage(success)
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'IPTV işlemi başarısız.',
      )
    } finally {
      setActionPending(false)
    }
  }

  const activeList = useMemo(
    () => iptv.lists.find((list) => list.id === iptv.activeListId) ?? null,
    [iptv.activeListId, iptv.lists],
  )

  return (
    <IptvLibraryView
      iptv={iptv}
      query={query}
      group={group}
      visibleLimit={visibleLimit}
      importName={importName}
      importUrl={importUrl}
      pasteText={pasteText}
      actionPending={actionPending}
      actionMessage={actionMessage}
      actionError={actionError}
      onQueryChange={(value) => {
        setQuery(value)
        setVisibleLimit(PAGE_SIZE)
      }}
      onGroupChange={(value) => {
        setGroup(value)
        setVisibleLimit(PAGE_SIZE)
      }}
      onShowMore={() => setVisibleLimit((current) => current + PAGE_SIZE)}
      onSelectList={(id) =>
        void run(() => iptv.selectList(id), 'Liste açıldı.')
      }
      onPlayChannel={onPlayChannel}
      onImportNameChange={setImportName}
      onImportUrlChange={setImportUrl}
      onPasteTextChange={setPasteText}
      onImportUrlSubmit={(event) => {
        event.preventDefault()
        const url = importUrl.trim()
        if (!url) return
        void run(async () => {
          await iptv.importUrl(url, importName)
          setImportUrl('')
          setImportName('')
        }, 'IPTV listesi URL’den içe aktarıldı.')
      }}
      onFileChange={(file) =>
        void run(async () => {
          await iptv.importFile(file, importName)
          setImportName('')
        }, 'IPTV dosyası içe aktarıldı.')
      }
      onImportTextSubmit={(event) => {
        event.preventDefault()
        const text = pasteText.trim()
        if (!text) return
        void run(async () => {
          await iptv.importText(text, importName)
          setPasteText('')
          setImportName('')
        }, 'IPTV metni içe aktarıldı.')
      }}
      onRefreshList={() => {
        if (!activeList) return
        void run(
          () => iptv.refreshList(activeList.id),
          'IPTV listesi yenilendi.',
        )
      }}
      onDeleteList={() => {
        if (!activeList) return
        void run(() => iptv.deleteList(activeList.id), 'IPTV listesi silindi.')
      }}
    />
  )
}
