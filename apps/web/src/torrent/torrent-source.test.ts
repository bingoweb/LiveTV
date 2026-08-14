import { describe, expect, it } from 'vitest'

import {
  choosePreferredTorrentFile,
  classifyTorrentMediaFile,
  createTorrentLibrarySource,
  TORRENT_FILE_MAX_BYTES,
  torrentSourceKey,
  validateTorrentTextSource,
} from './torrent-source'
import type { TorrentFileDescriptor } from './torrent-types'

const magnet =
  'magnet:?xt=urn:btih:0123456789ABCDEF0123456789ABCDEF01234567&dn=Sintel'

describe('torrent source helpers', () => {
  it('accepts canonical magnet and HTTP(S) torrent sources', () => {
    expect(validateTorrentTextSource(`  ${magnet}  `)).toBe(magnet)
    expect(
      validateTorrentTextSource(
        'https://example.com/releases/movie.torrent?token=1',
      ),
    ).toBe('https://example.com/releases/movie.torrent?token=1')
  })

  it('rejects ordinary media, custom schemes, and malformed magnets', () => {
    expect(() =>
      validateTorrentTextSource('https://example.com/video.mp4'),
    ).toThrow('.torrent')
    expect(() =>
      validateTorrentTextSource('file:///tmp/movie.torrent'),
    ).toThrow('magnet veya HTTP(S)')
    expect(() => validateTorrentTextSource('magnet:?dn=missing-hash')).toThrow(
      'info hash',
    )
  })

  it('keeps local torrent metadata capped at 5 MiB', () => {
    expect(TORRENT_FILE_MAX_BYTES).toBe(5 * 1024 * 1024)
  })

  it('classifies browser media candidates by MIME and extension', () => {
    expect(classifyTorrentMediaFile({ name: 'movie.mp4' })).toBe('video')
    expect(classifyTorrentMediaFile({ name: 'movie.MKV' })).toBe('video')
    expect(classifyTorrentMediaFile({ name: 'song.flac' })).toBe('audio')
    expect(
      classifyTorrentMediaFile({ name: 'ambiguous.ogg', type: 'audio/ogg' }),
    ).toBe('audio')
    expect(
      classifyTorrentMediaFile({ name: 'ambiguous.ogg', type: 'video/ogg' }),
    ).toBe('video')
    expect(classifyTorrentMediaFile({ name: 'notes.txt' })).toBe('unsupported')
  })

  it('chooses a preferred playable path or the only playable file', () => {
    const files: TorrentFileDescriptor[] = [
      {
        path: 'Extras/readme.txt',
        name: 'readme.txt',
        size: 100,
        type: 'text/plain',
        mediaType: 'unsupported',
        progress: 0,
      },
      {
        path: 'Movie/Sintel.mp4',
        name: 'Sintel.mp4',
        size: 1_000,
        type: 'video/mp4',
        mediaType: 'video',
        progress: 0,
      },
    ]

    expect(choosePreferredTorrentFile(files, 'Movie/Sintel.mp4')?.path).toBe(
      'Movie/Sintel.mp4',
    )
    expect(choosePreferredTorrentFile(files)?.path).toBe('Movie/Sintel.mp4')
  })

  it('does not auto-select when multiple playable files exist', () => {
    const files: TorrentFileDescriptor[] = [
      {
        path: 'one.mp4',
        name: 'one.mp4',
        size: 1,
        type: 'video/mp4',
        mediaType: 'video',
        progress: 0,
      },
      {
        path: 'two.mp3',
        name: 'two.mp3',
        size: 1,
        type: 'audio/mpeg',
        mediaType: 'audio',
        progress: 0,
      },
    ]

    expect(choosePreferredTorrentFile(files)).toBeNull()
  })

  it('creates stable library identity from lowercase infoHash and file path', () => {
    expect(
      torrentSourceKey(
        'ABCDEF0123456789ABCDEF0123456789ABCDEF01',
        'Movie/Sintel 1080p.mp4',
      ),
    ).toBe(
      'torrent:abcdef0123456789abcdef0123456789abcdef01:Movie%2FSintel%201080p.mp4',
    )

    expect(
      createTorrentLibrarySource({
        infoHash: 'ABCDEF0123456789ABCDEF0123456789ABCDEF01',
        magnetUri: magnet,
        filePath: 'Movie/Sintel 1080p.mp4',
        fileName: 'Sintel 1080p.mp4',
        mediaType: 'video',
      }),
    ).toEqual({
      sourceKey:
        'torrent:abcdef0123456789abcdef0123456789abcdef01:Movie%2FSintel%201080p.mp4',
      kind: 'torrent',
      url: magnet,
      title: 'Sintel 1080p.mp4',
      torrentFilePath: 'Movie/Sintel 1080p.mp4',
      torrentMediaType: 'video',
    })
  })
})
