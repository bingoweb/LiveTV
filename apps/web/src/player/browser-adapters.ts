import type {
  PlayerAdapter,
  PlayerAdapterFactories,
  PlayerQuality,
  PlayerSource,
} from '@livetv/player-core'
import type Hls from 'hls.js'

import {
  buildBasePlyrOptions,
  buildYouTubePlyrOptions,
  type YouTubeEmbedMode,
  toHlsQualities,
} from './player-config'

type PlyrConstructor = typeof import('plyr')
type PlyrInstance = InstanceType<PlyrConstructor>

let plyrConstructorPromise: Promise<PlyrConstructor> | null = null
let hlsModulePromise: Promise<typeof import('hls.js')> | null = null

function loadPlyr() {
  plyrConstructorPromise ??= import('plyr').then((module) => {
    const imported = module as unknown as {
      default?: PlyrConstructor
    }
    return imported.default ?? (module as unknown as PlyrConstructor)
  })
  return plyrConstructorPromise
}

function loadHlsModule() {
  hlsModulePromise ??= import('hls.js')
  return hlsModulePromise
}

export type BrowserPlayerState =
  'loading' | 'ready' | 'playing' | 'paused' | 'ended'

export type BrowserPlayerCallbacks = {
  onStateChange: (state: BrowserPlayerState) => void
  onError: (message: string) => void
  onQualities: (qualities: readonly PlayerQuality[]) => void
}

export type BrowserPlayerOptions = {
  getYouTubeEmbedMode?: () => YouTubeEmbedMode
}

function describeMediaError(media: HTMLMediaElement) {
  const code = media.error?.code
  if (!code) return 'Medya oynatılırken bilinmeyen bir hata oluştu.'

  const messages: Record<number, string> = {
    1: 'Medya yükleme işlemi iptal edildi.',
    2: 'Medya kaynağına ağ üzerinden erişilemedi.',
    3: 'Medya çözümlenemedi; codec veya dosya bozuk olabilir.',
    4: 'Tarayıcı bu medya biçimini veya kaynağı desteklemiyor.',
  }

  return messages[code] ?? 'Medya oynatılırken bir hata oluştu.'
}

function bindPlayerEvents(
  player: PlyrInstance,
  media: HTMLElement,
  callbacks: BrowserPlayerCallbacks,
) {
  player.on('ready', () => callbacks.onStateChange('ready'))
  player.on('playing', () => callbacks.onStateChange('playing'))
  player.on('play', () => callbacks.onStateChange('playing'))
  player.on('pause', () => callbacks.onStateChange('paused'))
  player.on('ended', () => callbacks.onStateChange('ended'))
  player.on('error', () => {
    if (media instanceof HTMLMediaElement) {
      callbacks.onError(describeMediaError(media))
      return
    }

    callbacks.onError('Gömülü oynatıcı kaynağı açamadı.')
  })
}

abstract class BaseBrowserAdapter implements PlayerAdapter {
  abstract readonly kind: PlayerSource['kind']
  protected player: PlyrInstance | null = null

  constructor(
    protected readonly host: HTMLElement,
    protected readonly callbacks: BrowserPlayerCallbacks,
  ) {}

  abstract load(source: PlayerSource): Promise<void>

  async play() {
    await this.player?.play()
  }

  pause() {
    this.player?.pause()
  }

  getQualities(): readonly PlayerQuality[] {
    return []
  }

  setQuality(id: number) {
    void id
  }

  destroy() {
    this.player?.destroy()
    this.player = null
    this.host.replaceChildren()
  }
}

class DirectBrowserAdapter extends BaseBrowserAdapter {
  readonly kind = 'direct' as const

  async load(source: PlayerSource) {
    if (source.kind !== 'direct')
      throw new Error('Direct adapter yanlış kaynak aldı.')
    this.callbacks.onStateChange('loading')
    this.callbacks.onQualities([])

    const media = document.createElement(source.mediaType)
    media.preload = 'metadata'
    media.controls = true
    media.src = source.url
    if (media instanceof HTMLVideoElement) media.playsInline = true

    this.host.replaceChildren(media)
    const PlyrConstructor = await loadPlyr()
    this.player = new PlyrConstructor(media, buildBasePlyrOptions())
    bindPlayerEvents(this.player, media, this.callbacks)

    media.load()
  }
}

class YouTubeBrowserAdapter extends BaseBrowserAdapter {
  readonly kind = 'youtube' as const

  constructor(
    host: HTMLElement,
    callbacks: BrowserPlayerCallbacks,
    private readonly getEmbedMode: () => YouTubeEmbedMode,
  ) {
    super(host, callbacks)
  }

  async load(source: PlayerSource) {
    if (source.kind !== 'youtube')
      throw new Error('YouTube adapter yanlış kaynak aldı.')
    this.callbacks.onStateChange('loading')
    this.callbacks.onQualities([])

    const embed = document.createElement('div')
    embed.dataset.plyrProvider = 'youtube'
    embed.dataset.plyrEmbedId = source.videoId
    embed.setAttribute('aria-label', 'YouTube oynatıcı')

    this.host.replaceChildren(embed)
    const PlyrConstructor = await loadPlyr()
    this.player = new PlyrConstructor(
      embed,
      buildYouTubePlyrOptions(window.location.origin, this.getEmbedMode()),
    )
    bindPlayerEvents(this.player, embed, this.callbacks)
  }
}

class HlsBrowserAdapter extends BaseBrowserAdapter {
  readonly kind = 'hls' as const
  private hls: Hls | null = null
  private qualities: readonly PlayerQuality[] = []

  async load(source: PlayerSource) {
    if (source.kind !== 'hls')
      throw new Error('HLS adapter yanlış kaynak aldı.')
    this.callbacks.onStateChange('loading')
    this.callbacks.onQualities([])

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.controls = true
    video.playsInline = true
    this.host.replaceChildren(video)

    const PlyrConstructor = await loadPlyr()
    this.player = new PlyrConstructor(video, buildBasePlyrOptions())
    bindPlayerEvents(this.player, video, this.callbacks)

    const { default: HlsConstructor, ErrorTypes } = await loadHlsModule()

    if (HlsConstructor.isSupported()) {
      const hls = new HlsConstructor({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 60,
      })
      this.hls = hls

      hls.on(HlsConstructor.Events.MANIFEST_PARSED, () => {
        this.qualities = toHlsQualities(hls.levels)
        this.callbacks.onQualities(this.qualities)
        this.callbacks.onStateChange('ready')
      })

      hls.on(HlsConstructor.Events.ERROR, (_event, data) => {
        if (!data.fatal) return

        if (data.type === ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
          return
        }

        if (data.type === ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
          return
        }

        this.callbacks.onError(`HLS akışı açılamadı: ${data.details}`)
      })

      hls.attachMedia(video)
      hls.loadSource(source.url)
      return
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source.url
      video.addEventListener(
        'loadedmetadata',
        () => this.callbacks.onStateChange('ready'),
        { once: true },
      )
      video.load()
      return
    }

    throw new Error('Bu tarayıcı HLS oynatmayı desteklemiyor.')
  }

  override getQualities() {
    return this.qualities
  }

  override setQuality(id: number) {
    if (!this.hls) return
    this.hls.currentLevel = id
  }

  override destroy() {
    this.hls?.destroy()
    this.hls = null
    this.qualities = []
    super.destroy()
  }
}

export function createBrowserAdapterFactories(
  host: HTMLElement,
  callbacks: BrowserPlayerCallbacks,
  options: BrowserPlayerOptions = {},
): PlayerAdapterFactories {
  const getYouTubeEmbedMode = options.getYouTubeEmbedMode ?? (() => 'privacy')

  return {
    direct: () => new DirectBrowserAdapter(host, callbacks),
    youtube: () =>
      new YouTubeBrowserAdapter(host, callbacks, getYouTubeEmbedMode),
    hls: () => new HlsBrowserAdapter(host, callbacks),
  }
}
