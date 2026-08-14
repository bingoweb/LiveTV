import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  TorrentProvider,
  useTorrent,
  type TorrentControllerLike,
} from './torrent-context'
import type { TorrentSnapshot } from './torrent-controller'

function snapshot(overrides: Partial<TorrentSnapshot> = {}): TorrentSnapshot {
  return {
    status: 'idle',
    supported: null,
    files: [],
    numPeers: 0,
    progress: 0,
    downloadSpeed: 0,
    uploadSpeed: 0,
    downloaded: 0,
    uploaded: 0,
    timeRemaining: Infinity,
    noPeers: false,
    ...overrides,
  }
}

function controller(initial = snapshot()): TorrentControllerLike {
  return {
    getSnapshot: () => initial,
    subscribe: () => () => {},
    openTextSource: vi.fn(async () => {}),
    openTorrentFile: vi.fn(async () => {}),
    selectFile: vi.fn(async () => {
      throw new Error('not needed')
    }),
    stop: vi.fn(async () => {}),
    destroy: vi.fn(async () => {}),
  }
}

function Probe() {
  const torrent = useTorrent()
  return (
    <span>
      {torrent.status}:{String(torrent.supported)}:
      {torrent.errorMessage ?? 'ok'}
    </span>
  )
}

describe('TorrentProvider', () => {
  it('pins one controller instance for the provider lifetime', () => {
    const source = readFileSync(
      'apps/web/src/torrent/torrent-context.tsx',
      'utf8',
    )

    expect(source).toContain('useState(() => controllerFactory())')
    expect(source).not.toContain('[controllerFactory]')
  })

  it('renders children from the idle snapshot without starting browser runtime work', () => {
    const fake = controller()
    const factory = vi.fn(() => fake)

    const markup = renderToStaticMarkup(
      <TorrentProvider controllerFactory={factory}>
        <Probe />
      </TorrentProvider>,
    )

    expect(markup).toContain('idle:false:ok'.replace('false', 'null'))
    expect(factory).toHaveBeenCalledOnce()
    expect(vi.mocked(fake.openTextSource)).not.toHaveBeenCalled()
  })

  it('surfaces a torrent-only unsupported/error snapshot without hiding children', () => {
    const fake = controller(
      snapshot({
        status: 'error',
        supported: false,
        errorMessage: 'WebRTC desteklenmiyor',
      }),
    )

    const markup = renderToStaticMarkup(
      <TorrentProvider controllerFactory={() => fake}>
        <Probe />
        <strong>uygulama içerik</strong>
      </TorrentProvider>,
    )

    expect(markup).toContain('error:false:WebRTC desteklenmiyor')
    expect(markup).toContain('uygulama içerik')
  })
})
