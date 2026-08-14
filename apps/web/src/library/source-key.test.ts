import type { PlayerSource } from '@livetv/player-core'
import { describe, expect, it } from 'vitest'

import { toLibrarySource } from './library-types'
import { createSourceKey } from './source-key'
import { createTorrentLibrarySource } from '../torrent/torrent-source'

describe('library source identity', () => {
  it('uses the YouTube video id as stable identity', () => {
    const source: PlayerSource = {
      kind: 'youtube',
      originalUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    }

    expect(createSourceKey(source)).toBe('youtube:dQw4w9WgXcQ')
    expect(toLibrarySource(source).sourceKey).toBe('youtube:dQw4w9WgXcQ')
  })

  it('preserves signed query parameters while removing fragments', () => {
    const source: PlayerSource = {
      kind: 'hls',
      originalUrl: 'https://EXAMPLE.com/live.m3u8?token=abc#player',
      url: 'https://EXAMPLE.com/live.m3u8?token=abc#player',
    }

    expect(createSourceKey(source)).toBe(
      'hls:https://example.com/live.m3u8?token=abc',
    )
  })

  it('distinguishes direct audio from direct video', () => {
    const audio: PlayerSource = {
      kind: 'direct',
      mediaType: 'audio',
      originalUrl: 'https://example.com/media.bin',
      url: 'https://example.com/media.bin',
    }
    const video: PlayerSource = {
      kind: 'direct',
      mediaType: 'video',
      originalUrl: 'https://example.com/media.bin',
      url: 'https://example.com/media.bin',
    }

    expect(createSourceKey(audio)).toBe('audio:https://example.com/media.bin')
    expect(createSourceKey(video)).toBe('video:https://example.com/media.bin')
  })

  it('carries caller metadata into the library source', () => {
    const source: PlayerSource = {
      kind: 'youtube',
      originalUrl: 'https://youtu.be/dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      videoId: 'dQw4w9WgXcQ',
    }

    expect(
      toLibrarySource(source, {
        title: 'Canlı yayın',
        thumbnailUrl: 'https://img.example/thumb.jpg',
        channelUrl: 'https://www.youtube.com/@channel',
      }),
    ).toEqual({
      sourceKey: 'youtube:dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      kind: 'youtube',
      title: 'Canlı yayın',
      thumbnailUrl: 'https://img.example/thumb.jpg',
      channelUrl: 'https://www.youtube.com/@channel',
    })
  })

  it('preserves a stable torrent library source key instead of its magnet URL', () => {
    const source = createTorrentLibrarySource({
      infoHash: '0123456789abcdef0123456789abcdef01234567',
      magnetUri: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
      filePath: 'Movie/Sintel.mp4',
      fileName: 'Sintel.mp4',
      mediaType: 'video',
    })

    expect(createSourceKey(source)).toBe(source.sourceKey)
  })
})
