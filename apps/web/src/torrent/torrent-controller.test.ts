import { EventEmitter } from 'node:events'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TorrentController } from './torrent-controller'
import type {
  TorrentRuntime,
  TorrentRuntimeFile,
  TorrentRuntimeTorrent,
} from './webtorrent-runtime'

class FakeFile implements TorrentRuntimeFile {
  selected = false
  constructor(
    readonly path: string,
    readonly length: number,
    readonly type: string,
    readonly streamURL: string,
  ) {}

  get name() {
    return this.path.split('/').at(-1) ?? this.path
  }

  progress = 0

  select() {
    this.selected = true
  }

  deselect() {
    this.selected = false
  }
}

class FakeTorrent extends EventEmitter implements TorrentRuntimeTorrent {
  infoHash = '0123456789abcdef0123456789abcdef01234567'
  magnetURI =
    'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=Sintel'
  name = 'Sintel'
  files: TorrentRuntimeFile[] = []
  numPeers = 0
  progress = 0
  downloadSpeed = 0
  uploadSpeed = 0
  downloaded = 0
  uploaded = 0
  timeRemaining = Infinity
}

class FakeRuntime implements TorrentRuntime {
  supported = true
  added: Array<string | Uint8Array> = []
  removed: TorrentRuntimeTorrent[] = []
  destroyed = 0
  nextTorrent = new FakeTorrent()
  errorListeners = new Set<(error: Error) => void>()

  add(source: string | Uint8Array) {
    this.added.push(source)
    return this.nextTorrent
  }

  async remove(torrent: TorrentRuntimeTorrent) {
    this.removed.push(torrent)
  }

  async destroy() {
    this.destroyed += 1
  }

  onError(listener: (error: Error) => void) {
    this.errorListeners.add(listener)
    return () => this.errorListeners.delete(listener)
  }
}

describe('TorrentController', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('initializes lazily and opens one active magnet session', async () => {
    const runtime = new FakeRuntime()
    const factory = vi.fn(async () => runtime)
    const controller = new TorrentController({ runtimeFactory: factory })

    await controller.openTextSource(runtime.nextTorrent.magnetURI)

    expect(factory).toHaveBeenCalledTimes(1)
    expect(runtime.added).toEqual([runtime.nextTorrent.magnetURI])
    expect(controller.getSnapshot()).toMatchObject({
      status: 'metadata',
      supported: true,
      files: [],
    })
  })

  it('opens local torrent bytes and rejects files above 5 MiB', async () => {
    const runtime = new FakeRuntime()
    const controller = new TorrentController({
      runtimeFactory: async () => runtime,
    })
    const file = new File([new Uint8Array([1, 2, 3])], 'sintel.torrent')

    await controller.openTorrentFile(file)
    expect(runtime.added[0]).toBeInstanceOf(Uint8Array)

    const oversized = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      'large.torrent',
    )
    await expect(controller.openTorrentFile(oversized)).rejects.toThrow('5 MiB')
  })

  it('publishes metadata files and remembers a preferred replay path', async () => {
    const runtime = new FakeRuntime()
    const movie = new FakeFile(
      'Movie/Sintel.mp4',
      1_000,
      'video/mp4',
      '/webtorrent/webtorrent/hash/Movie/Sintel.mp4',
    )
    runtime.nextTorrent.files = [
      movie,
      new FakeFile('README.txt', 10, 'text/plain', '/webtorrent/readme'),
    ]
    const controller = new TorrentController({
      runtimeFactory: async () => runtime,
    })

    await controller.openTextSource(runtime.nextTorrent.magnetURI, movie.path)
    runtime.nextTorrent.emit('ready')

    expect(controller.getSnapshot()).toMatchObject({
      status: 'ready',
      torrentName: 'Sintel',
      selectedFilePath: 'Movie/Sintel.mp4',
      files: [
        { path: 'Movie/Sintel.mp4', mediaType: 'video' },
        { path: 'README.txt', mediaType: 'unsupported' },
      ],
    })
  })

  it('surfaces noPeers as advisory and clears it when download activity begins', async () => {
    const runtime = new FakeRuntime()
    const controller = new TorrentController({
      runtimeFactory: async () => runtime,
    })
    await controller.openTextSource(runtime.nextTorrent.magnetURI)

    runtime.nextTorrent.emit('noPeers', 'tracker')
    expect(controller.getSnapshot()).toMatchObject({
      noPeers: true,
      warningMessage: expect.stringContaining('WebRTC'),
    })

    runtime.nextTorrent.emit('download', 10)
    expect(controller.getSnapshot().noPeers).toBe(false)
  })

  it('isolates a fatal torrent error to the active torrent session', async () => {
    const runtime = new FakeRuntime()
    const controller = new TorrentController({
      runtimeFactory: async () => runtime,
    })
    await controller.openTextSource(runtime.nextTorrent.magnetURI)

    runtime.nextTorrent.emit('error', new Error('metadata failed'))

    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      errorMessage: 'metadata failed',
      supported: true,
    })
  })

  it('replaces the previous active torrent before opening another', async () => {
    const runtime = new FakeRuntime()
    const first = runtime.nextTorrent
    const controller = new TorrentController({
      runtimeFactory: async () => runtime,
    })
    await controller.openTextSource(first.magnetURI)
    runtime.nextTorrent = new FakeTorrent()
    runtime.nextTorrent.infoHash = 'fedcba9876543210fedcba9876543210fedcba98'
    runtime.nextTorrent.magnetURI =
      'magnet:?xt=urn:btih:fedcba9876543210fedcba9876543210fedcba98'

    await controller.openTextSource(runtime.nextTorrent.magnetURI)

    expect(runtime.removed).toEqual([first])
    expect(runtime.added).toHaveLength(2)
  })

  it('selects one playable file and returns a stable playback descriptor', async () => {
    const runtime = new FakeRuntime()
    const movie = new FakeFile(
      'Movie/Sintel.mp4',
      1_000,
      'video/mp4',
      '/webtorrent/webtorrent/hash/Movie/Sintel.mp4',
    )
    const audio = new FakeFile(
      'Audio/theme.mp3',
      200,
      'audio/mpeg',
      '/webtorrent/webtorrent/hash/Audio/theme.mp3',
    )
    runtime.nextTorrent.files = [movie, audio]
    const controller = new TorrentController({
      runtimeFactory: async () => runtime,
    })
    await controller.openTextSource(runtime.nextTorrent.magnetURI)
    runtime.nextTorrent.emit('ready')

    const descriptor = await controller.selectFile(movie.path)

    expect(movie.selected).toBe(true)
    expect(audio.selected).toBe(false)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'streaming',
      selectedFilePath: movie.path,
    })
    expect(descriptor).toEqual({
      streamUrl: movie.streamURL,
      preference: 'direct-video',
      title: 'Sintel.mp4',
      librarySource: expect.objectContaining({
        kind: 'torrent',
        url: runtime.nextTorrent.magnetURI,
        torrentFilePath: movie.path,
        torrentMediaType: 'video',
      }),
    })
  })

  it('refreshes aggregate stats once per second', async () => {
    const runtime = new FakeRuntime()
    const controller = new TorrentController({
      runtimeFactory: async () => runtime,
    })
    await controller.openTextSource(runtime.nextTorrent.magnetURI)
    runtime.nextTorrent.numPeers = 3
    runtime.nextTorrent.progress = 0.25
    runtime.nextTorrent.downloadSpeed = 1_000
    runtime.nextTorrent.uploadSpeed = 100
    runtime.nextTorrent.downloaded = 2_000
    runtime.nextTorrent.uploaded = 300
    runtime.nextTorrent.timeRemaining = 4_000

    await vi.advanceTimersByTimeAsync(1_000)

    expect(controller.getSnapshot()).toMatchObject({
      numPeers: 3,
      progress: 0.25,
      downloadSpeed: 1_000,
      uploadSpeed: 100,
      downloaded: 2_000,
      uploaded: 300,
      timeRemaining: 4_000,
    })
  })

  it('stop removes the active torrent and destroy also destroys the runtime', async () => {
    const runtime = new FakeRuntime()
    const controller = new TorrentController({
      runtimeFactory: async () => runtime,
    })
    await controller.openTextSource(runtime.nextTorrent.magnetURI)

    await controller.stop()
    expect(runtime.removed).toHaveLength(1)
    expect(controller.getSnapshot()).toMatchObject({
      status: 'idle',
      files: [],
    })

    await controller.destroy()
    expect(runtime.destroyed).toBe(1)
  })

  it('performs best-effort active torrent cleanup on beforeunload', async () => {
    const runtime = new FakeRuntime()
    const callbacks: { beforeUnload?: () => void } = {}
    const removeBeforeUnload = vi.fn()
    const controller = new TorrentController({
      runtimeFactory: async () => runtime,
      addBeforeUnloadListener(listener) {
        callbacks.beforeUnload = listener
        return removeBeforeUnload
      },
    })
    await controller.openTextSource(runtime.nextTorrent.magnetURI)

    callbacks.beforeUnload?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(runtime.removed).toHaveLength(1)
    await controller.destroy()
    expect(removeBeforeUnload).toHaveBeenCalledOnce()
  })
})
