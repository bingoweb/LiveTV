import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { TorrentContextValue } from '../torrent/torrent-context'
import type { TorrentFileDescriptor } from '../torrent/torrent-types'
import { TorrentWorkspaceView } from './TorrentWorkspace'

const movie: TorrentFileDescriptor = {
  path: 'Movie/Sintel.mp4',
  name: 'Sintel.mp4',
  size: 1_000_000,
  type: 'video/mp4',
  mediaType: 'video',
  progress: 0.25,
  streamUrl: '/webtorrent/hash/Movie/Sintel.mp4',
}

const readme: TorrentFileDescriptor = {
  path: 'README.txt',
  name: 'README.txt',
  size: 100,
  type: 'text/plain',
  mediaType: 'unsupported',
  progress: 1,
}

function torrent(
  overrides: Partial<TorrentContextValue> = {},
): TorrentContextValue {
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
    openTextSource: async () => {},
    openTorrentFile: async () => {},
    selectFile: async () => {
      throw new Error('not needed')
    },
    replaySource: async () => {
      throw new Error('not needed')
    },
    stop: async () => {},
    ...overrides,
  }
}

const noOp = () => {}

describe('TorrentWorkspaceView', () => {
  it('renders source controls and mandatory WebRTC/P2P disclosure while idle', () => {
    const markup = renderToStaticMarkup(
      <TorrentWorkspaceView
        torrent={torrent()}
        sourceInput=""
        actionPending={false}
        onSourceInputChange={noOp}
        onOpenSource={noOp}
        onOpenFile={noOp}
        onSelectFile={noOp}
        onStop={noOp}
      />,
    )

    expect(markup).toContain('Magnet veya .torrent URL’si')
    expect(markup).toContain('WebRTC')
    expect(markup).toContain('yükleme yapabilir')
    expect(markup).toContain('kalıcı torrent arşivi tutmaz')
  })

  it('renders initialization, metadata, no-peers, and fatal error states', () => {
    const markup = renderToStaticMarkup(
      <TorrentWorkspaceView
        torrent={torrent({
          status: 'error',
          supported: false,
          noPeers: true,
          warningMessage: 'WebRTC uyumlu eş bulunamadı',
          errorMessage: 'Service Worker desteklenmiyor',
        })}
        sourceInput="magnet:?xt=urn:btih:abc"
        actionPending={false}
        onSourceInputChange={noOp}
        onOpenSource={noOp}
        onOpenFile={noOp}
        onSelectFile={noOp}
        onStop={noOp}
      />,
    )

    expect(markup).toContain('WebRTC uyumlu eş bulunamadı')
    expect(markup).toContain('Service Worker desteklenmiyor')
  })

  it('renders torrent statistics and supported/unsupported files', () => {
    const markup = renderToStaticMarkup(
      <TorrentWorkspaceView
        torrent={torrent({
          status: 'ready',
          supported: true,
          torrentName: 'Sintel',
          infoHash: '0123456789abcdef0123456789abcdef01234567',
          magnetUri:
            'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
          files: [movie, readme],
          numPeers: 4,
          progress: 0.5,
          downloadSpeed: 2_000_000,
          uploadSpeed: 100_000,
          downloaded: 50_000_000,
          uploaded: 2_000_000,
          timeRemaining: 30_000,
        })}
        sourceInput=""
        actionPending={false}
        onSourceInputChange={noOp}
        onOpenSource={noOp}
        onOpenFile={noOp}
        onSelectFile={noOp}
        onStop={noOp}
      />,
    )

    expect(markup).toContain('Sintel')
    expect(markup).toContain('4 eş')
    expect(markup).toContain('2.0 MB/s')
    expect(markup).toContain('100.0 kB/s')
    expect(markup).toContain('Sintel.mp4')
    expect(markup).toContain('README.txt')
    expect(markup).toContain('Tarayıcıda oynatılamaz')
    expect(markup).toContain('Durdur ve temizle')
    expect(markup.match(/>Oynat</g)).toHaveLength(1)
  })
})
