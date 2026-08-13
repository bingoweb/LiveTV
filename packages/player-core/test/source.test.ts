import { describe, expect, it } from 'vitest'

import {
  PlayerSourceError,
  classifyPlayerSource,
  parseYouTubeChannelReference,
  parseYouTubeVideoId,
} from '../src/index'

describe('parseYouTubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=M7lc1UVf-VE', 'M7lc1UVf-VE'],
    ['https://youtu.be/M7lc1UVf-VE?t=12', 'M7lc1UVf-VE'],
    ['https://www.youtube.com/shorts/M7lc1UVf-VE', 'M7lc1UVf-VE'],
    ['https://www.youtube.com/embed/M7lc1UVf-VE', 'M7lc1UVf-VE'],
  ])('parses %s', (url, expected) => {
    expect(parseYouTubeVideoId(url)).toBe(expected)
  })

  it('returns null for non-YouTube URLs', () => {
    expect(parseYouTubeVideoId('https://example.com/video.mp4')).toBeNull()
  })
})

describe('classifyPlayerSource', () => {
  it('classifies YouTube, HLS, direct video, and direct audio', () => {
    expect(classifyPlayerSource('https://youtu.be/M7lc1UVf-VE')).toMatchObject({
      kind: 'youtube',
      videoId: 'M7lc1UVf-VE',
    })

    expect(
      classifyPlayerSource('https://example.com/live/master.m3u8?token=abc'),
    ).toMatchObject({ kind: 'hls' })

    expect(classifyPlayerSource('https://example.com/movie.mp4')).toMatchObject(
      {
        kind: 'direct',
        mediaType: 'video',
      },
    )

    expect(classifyPlayerSource('https://example.com/radio.mp3')).toMatchObject(
      {
        kind: 'direct',
        mediaType: 'audio',
      },
    )
  })

  it('keeps extensionless HTTP sources usable as direct video by default', () => {
    expect(
      classifyPlayerSource('https://cdn.example.com/stream?token=abc'),
    ).toMatchObject({ kind: 'direct', mediaType: 'video' })
  })

  it('allows an explicit source preference for ambiguous URLs', () => {
    const url = 'https://cdn.example.com/stream?token=abc'

    expect(classifyPlayerSource(url, 'hls')).toMatchObject({ kind: 'hls' })
    expect(classifyPlayerSource(url, 'direct-audio')).toMatchObject({
      kind: 'direct',
      mediaType: 'audio',
    })
  })

  it('rejects torrent and non-web URL schemes', () => {
    expect(() => classifyPlayerSource('magnet:?xt=urn:btih:abc')).toThrow(
      PlayerSourceError,
    )
    expect(() => classifyPlayerSource('ftp://example.com/movie.mp4')).toThrow(
      PlayerSourceError,
    )
  })
})

describe('parseYouTubeChannelReference', () => {
  it('recognizes handle and channel URLs but not video URLs', () => {
    expect(
      parseYouTubeChannelReference('https://www.youtube.com/@Halktvkanali'),
    ).toMatchObject({ kind: 'handle', value: '@Halktvkanali' })

    expect(
      parseYouTubeChannelReference(
        'https://www.youtube.com/channel/UCf_ResXZzE-o18zACUEmyvQ/live',
      ),
    ).toMatchObject({
      kind: 'channel',
      value: 'UCf_ResXZzE-o18zACUEmyvQ',
    })

    expect(
      parseYouTubeChannelReference(
        'https://www.youtube.com/watch?v=M7lc1UVf-VE',
      ),
    ).toBeNull()
  })
})
