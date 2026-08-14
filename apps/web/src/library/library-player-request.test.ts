import { describe, expect, it } from 'vitest'

import type { LibrarySource } from './library-types'
import {
  createPlayerOpenRequest,
  playerPreferenceForLibrarySource,
} from './library-player-request'

const sources: Record<LibrarySource['kind'], LibrarySource> = {
  youtube: {
    sourceKey: 'youtube:dQw4w9WgXcQ',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    kind: 'youtube',
    title: 'YouTube',
  },
  hls: {
    sourceKey: 'hls:https://example.com/live.m3u8',
    url: 'https://example.com/live.m3u8',
    kind: 'hls',
    title: 'HLS',
  },
  video: {
    sourceKey: 'video:https://example.com/video.mp4',
    url: 'https://example.com/video.mp4',
    kind: 'video',
    title: 'Video',
  },
  audio: {
    sourceKey: 'audio:https://example.com/audio.mp3',
    url: 'https://example.com/audio.mp3',
    kind: 'audio',
    title: 'Audio',
  },
  torrent: {
    sourceKey:
      'torrent:0123456789abcdef0123456789abcdef01234567:Movie%2FSintel.mp4',
    url: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
    kind: 'torrent',
    title: 'Sintel.mp4',
    torrentFilePath: 'Movie/Sintel.mp4',
    torrentMediaType: 'video',
  },
}

describe('library player request', () => {
  it('maps every library source kind to the existing unified player engine', () => {
    expect(playerPreferenceForLibrarySource(sources.youtube)).toBe('youtube')
    expect(playerPreferenceForLibrarySource(sources.hls)).toBe('hls')
    expect(playerPreferenceForLibrarySource(sources.video)).toBe('direct-video')
    expect(playerPreferenceForLibrarySource(sources.audio)).toBe('direct-audio')
    expect(() => playerPreferenceForLibrarySource(sources.torrent)).toThrow(
      'Torrent paneli',
    )
  })

  it('creates a fresh request id for repeated play-again actions', () => {
    const first = createPlayerOpenRequest(0, sources.youtube)
    const second = createPlayerOpenRequest(first.id, sources.youtube)

    expect(first).toEqual({ id: 1, source: sources.youtube })
    expect(second).toEqual({ id: 2, source: sources.youtube })
  })
})
