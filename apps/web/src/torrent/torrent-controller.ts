import {
  choosePreferredTorrentFile,
  classifyTorrentMediaFile,
  createTorrentLibrarySource,
  TORRENT_FILE_MAX_BYTES,
  validateTorrentTextSource,
} from './torrent-source'
import type { TorrentFileDescriptor } from './torrent-types'
import {
  createBrowserWebTorrentRuntime,
  type TorrentRuntime,
  type TorrentRuntimeFile,
  type TorrentRuntimeTorrent,
} from './webtorrent-runtime'

export type TorrentSnapshot = {
  status: 'idle' | 'initializing' | 'metadata' | 'ready' | 'streaming' | 'error'
  supported: boolean | null
  torrentName?: string
  infoHash?: string
  magnetUri?: string
  files: readonly TorrentFileDescriptor[]
  selectedFilePath?: string
  numPeers: number
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  downloaded: number
  uploaded: number
  timeRemaining: number
  noPeers: boolean
  warningMessage?: string
  errorMessage?: string
}

export type TorrentPlaybackDescriptor = {
  streamUrl: string
  preference: 'direct-video' | 'direct-audio'
  title: string
  librarySource: ReturnType<typeof createTorrentLibrarySource>
}

type TorrentControllerOptions = {
  runtimeFactory?: () => Promise<TorrentRuntime>
  addBeforeUnloadListener?: (listener: () => void) => () => void
}

const EMPTY_STATS = {
  numPeers: 0,
  progress: 0,
  downloadSpeed: 0,
  uploadSpeed: 0,
  downloaded: 0,
  uploaded: 0,
  timeRemaining: Infinity,
  noPeers: false,
} as const

const INITIAL_SNAPSHOT: TorrentSnapshot = {
  status: 'idle',
  supported: null,
  files: [],
  ...EMPTY_STATS,
}

type ListenerRecord = {
  event: string
  listener: (...args: unknown[]) => void
}

function descriptor(file: TorrentRuntimeFile): TorrentFileDescriptor {
  return {
    path: file.path,
    name: file.name,
    size: file.length,
    type: file.type ?? '',
    mediaType: classifyTorrentMediaFile({ name: file.name, type: file.type }),
    progress: Number.isFinite(file.progress) ? file.progress : 0,
    ...(file.streamURL ? { streamUrl: file.streamURL } : {}),
  }
}

export class TorrentController {
  private snapshot: TorrentSnapshot = INITIAL_SNAPSHOT
  private readonly listeners = new Set<() => void>()
  private runtime: TorrentRuntime | null = null
  private runtimeInitialization: Promise<TorrentRuntime> | null = null
  private runtimeErrorCleanup: (() => void) | null = null
  private activeTorrent: TorrentRuntimeTorrent | null = null
  private torrentListeners: ListenerRecord[] = []
  private statsTimer: ReturnType<typeof setInterval> | null = null
  private preferredFilePath: string | undefined
  private readonly removeBeforeUnloadListener: () => void

  constructor(private readonly options: TorrentControllerOptions = {}) {
    const addBeforeUnloadListener =
      options.addBeforeUnloadListener ??
      ((listener: () => void) => {
        if (typeof window === 'undefined') return () => {}
        window.addEventListener('beforeunload', listener)
        return () => window.removeEventListener('beforeunload', listener)
      })
    this.removeBeforeUnloadListener = addBeforeUnloadListener(() => {
      void this.stop().catch(() => undefined)
    })
  }

  getSnapshot = () => this.snapshot

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(snapshot: TorrentSnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }

  private patch(update: Partial<TorrentSnapshot>) {
    this.emit({ ...this.snapshot, ...update })
  }

  async initialize() {
    if (this.runtime) return this.runtime
    if (this.runtimeInitialization) return await this.runtimeInitialization

    this.patch({ status: 'initializing', errorMessage: undefined })
    this.runtimeInitialization = (async () => {
      try {
        const runtime = await (
          this.options.runtimeFactory ?? createBrowserWebTorrentRuntime
        )()
        this.runtime = runtime
        this.runtimeErrorCleanup = runtime.onError((error) => {
          this.patch({ status: 'error', errorMessage: error.message })
        })
        this.patch({ supported: runtime.supported, status: 'idle' })
        return runtime
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Browser WebTorrent başlatılamadı.'
        this.patch({ status: 'error', supported: false, errorMessage: message })
        this.runtimeInitialization = null
        throw error
      }
    })()
    return await this.runtimeInitialization
  }

  private clearStatsTimer() {
    if (this.statsTimer !== null) {
      clearInterval(this.statsTimer)
      this.statsTimer = null
    }
  }

  private detachTorrentListeners() {
    const torrent = this.activeTorrent
    if (torrent) {
      for (const { event, listener } of this.torrentListeners) {
        torrent.off(event, listener)
      }
    }
    this.torrentListeners = []
    this.clearStatsTimer()
  }

  private listen(
    torrent: TorrentRuntimeTorrent,
    event: string,
    listener: (...args: unknown[]) => void,
  ) {
    torrent.on(event, listener)
    this.torrentListeners.push({ event, listener })
  }

  private refreshStats() {
    const torrent = this.activeTorrent
    if (!torrent) return
    this.patch({
      numPeers: torrent.numPeers,
      progress: torrent.progress,
      downloadSpeed: torrent.downloadSpeed,
      uploadSpeed: torrent.uploadSpeed,
      downloaded: torrent.downloaded,
      uploaded: torrent.uploaded,
      timeRemaining: torrent.timeRemaining,
      files: this.snapshot.files.map((file) => {
        const runtimeFile = torrent.files.find(({ path }) => path === file.path)
        return runtimeFile ? { ...file, progress: runtimeFile.progress } : file
      }),
    })
  }

  private attachTorrent(torrent: TorrentRuntimeTorrent) {
    const ready = () => {
      if (this.activeTorrent !== torrent) return
      const files = torrent.files.map(descriptor)
      const preferred = choosePreferredTorrentFile(
        files,
        this.preferredFilePath,
      )
      this.patch({
        status: 'ready',
        torrentName: torrent.name,
        infoHash: torrent.infoHash,
        magnetUri: torrent.magnetURI,
        files,
        selectedFilePath: preferred?.path,
        errorMessage: undefined,
      })
      this.refreshStats()
    }
    const noPeers = () => {
      this.patch({
        noPeers: true,
        warningMessage:
          'Tarayıcı WebTorrent yalnız WebRTC uyumlu eşleri veya web seed kaynaklarını görebilir.',
      })
    }
    const activity = () => {
      this.patch({ noPeers: false, warningMessage: undefined })
      this.refreshStats()
    }
    const warning = (...args: unknown[]) => {
      const candidate = args[0]
      this.patch({
        warningMessage:
          candidate instanceof Error
            ? candidate.message
            : String(candidate ?? 'WebTorrent uyarısı'),
      })
    }
    const error = (...args: unknown[]) => {
      const candidate = args[0]
      this.patch({
        status: 'error',
        errorMessage:
          candidate instanceof Error
            ? candidate.message
            : String(candidate ?? 'Torrent oturumu başarısız.'),
      })
    }

    this.listen(torrent, 'ready', ready)
    this.listen(torrent, 'noPeers', noPeers)
    this.listen(torrent, 'download', activity)
    this.listen(torrent, 'upload', activity)
    this.listen(torrent, 'done', activity)
    this.listen(torrent, 'warning', warning)
    this.listen(torrent, 'error', error)
    this.statsTimer = setInterval(() => this.refreshStats(), 1_000)
  }

  private async openSource(
    source: string | Uint8Array,
    preferredFilePath?: string,
  ) {
    const runtime = await this.initialize()
    if (this.activeTorrent) await this.stop()

    this.preferredFilePath = preferredFilePath
    this.emit({
      ...INITIAL_SNAPSHOT,
      status: 'metadata',
      supported: true,
    })
    const torrent = runtime.add(source)
    this.activeTorrent = torrent
    this.attachTorrent(torrent)
  }

  async openTextSource(input: string, preferredFilePath?: string) {
    await this.openSource(validateTorrentTextSource(input), preferredFilePath)
  }

  async openTorrentFile(file: File, preferredFilePath?: string) {
    if (file.size > TORRENT_FILE_MAX_BYTES) {
      throw new Error('Torrent metadata dosyası 5 MiB boyut sınırını aşıyor.')
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    await this.openSource(bytes, preferredFilePath)
  }

  async selectFile(path: string): Promise<TorrentPlaybackDescriptor> {
    const torrent = this.activeTorrent
    if (!torrent) throw new Error('Aktif torrent oturumu yok.')
    const runtimeFile = torrent.files.find((file) => file.path === path)
    if (!runtimeFile) throw new Error('Torrent dosyası bulunamadı.')
    const file = descriptor(runtimeFile)
    if (file.mediaType === 'unsupported') {
      throw new Error('Bu torrent dosyası tarayıcı medya adayı değil.')
    }

    for (const candidate of torrent.files) {
      if (candidate === runtimeFile) candidate.select()
      else candidate.deselect()
    }
    this.patch({ status: 'streaming', selectedFilePath: path })

    return {
      streamUrl: runtimeFile.streamURL,
      preference: file.mediaType === 'audio' ? 'direct-audio' : 'direct-video',
      title: file.name,
      librarySource: createTorrentLibrarySource({
        infoHash: torrent.infoHash,
        magnetUri: torrent.magnetURI,
        filePath: runtimeFile.path,
        fileName: runtimeFile.name,
        mediaType: file.mediaType,
      }),
    }
  }

  async stop() {
    const torrent = this.activeTorrent
    this.detachTorrentListeners()
    this.activeTorrent = null
    this.preferredFilePath = undefined
    if (torrent && this.runtime) await this.runtime.remove(torrent)
    this.emit({
      ...INITIAL_SNAPSHOT,
      supported: this.runtime?.supported ?? this.snapshot.supported,
    })
  }

  async destroy() {
    await this.stop()
    this.removeBeforeUnloadListener()
    this.runtimeErrorCleanup?.()
    this.runtimeErrorCleanup = null
    if (this.runtime) await this.runtime.destroy()
    this.runtime = null
    this.runtimeInitialization = null
  }
}
