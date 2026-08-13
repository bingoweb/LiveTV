import {
  PlayerSourceError,
  classifyPlayerSource,
  type PlayerSource,
  type PlayerSourceKind,
  type PlayerSourcePreference,
} from './source.js'

export type PlayerQuality = {
  id: number
  label: string
  height?: number
  bitrate?: number
}

export interface PlayerAdapter {
  readonly kind: PlayerSourceKind
  load(source: PlayerSource): Promise<void>
  play(): Promise<void>
  pause(): void
  destroy(): void | Promise<void>
  getQualities?(): readonly PlayerQuality[]
  setQuality?(id: number): void
}

export type PlayerAdapterFactory = () => PlayerAdapter
export type PlayerAdapterFactories = Record<
  PlayerSourceKind,
  PlayerAdapterFactory
>

export class PlayerController {
  private activeAdapter: PlayerAdapter | null = null
  private activeSource: PlayerSource | null = null

  constructor(private readonly factories: PlayerAdapterFactories) {}

  get source() {
    return this.activeSource
  }

  get adapter() {
    return this.activeAdapter
  }

  async load(input: string, preference: PlayerSourcePreference = 'auto') {
    const source = classifyPlayerSource(input, preference)
    await this.destroyActiveAdapter()

    const adapter = this.factories[source.kind]()
    this.activeAdapter = adapter

    try {
      await adapter.load(source)
      this.activeSource = source
      return source
    } catch (error) {
      await adapter.destroy()
      this.activeAdapter = null
      this.activeSource = null
      throw error
    }
  }

  async play() {
    if (!this.activeAdapter) {
      throw new PlayerSourceError(
        'NO_ACTIVE_SOURCE',
        'Önce bir medya kaynağı aç.',
      )
    }

    await this.activeAdapter.play()
  }

  pause() {
    this.activeAdapter?.pause()
  }

  getQualities() {
    return this.activeAdapter?.getQualities?.() ?? []
  }

  setQuality(id: number) {
    this.activeAdapter?.setQuality?.(id)
  }

  async destroy() {
    await this.destroyActiveAdapter()
  }

  private async destroyActiveAdapter() {
    if (this.activeAdapter) await this.activeAdapter.destroy()
    this.activeAdapter = null
    this.activeSource = null
  }
}
