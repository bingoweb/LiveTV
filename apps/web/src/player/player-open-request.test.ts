import { describe, expect, it } from 'vitest'

import type { IptvChannel } from '../iptv/iptv-repository'
import type { LibrarySource } from '../library/library-types'
import {
  createPlayerOpenRequest,
  playerPreferenceForIptvChannel,
  playerRequestForIptvChannel,
  playerRequestForLibrarySource,
} from './player-open-request'

describe('common player open requests', () => {
  it('preserves P3 saved-source engine preferences and metadata', () => {
    const source: LibrarySource = {
      sourceKey: 'youtube:abcdefghijk',
      kind: 'youtube',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
      title: 'Kaydedilmiş yayın',
      thumbnailUrl: 'https://img.example/thumb.jpg',
      channelUrl: 'https://www.youtube.com/@example',
    }

    expect(playerRequestForLibrarySource(4, source)).toEqual({
      id: 5,
      url: source.url,
      preference: 'youtube',
      title: 'Kaydedilmiş yayın',
      thumbnailUrl: 'https://img.example/thumb.jpg',
      channelUrl: 'https://www.youtube.com/@example',
    })
  })

  it('uses explicit HLS for m3u8 IPTV channels and auto for extensionless streams', () => {
    const hls: IptvChannel = {
      id: 'hls',
      listId: 'list',
      position: 0,
      searchText: 'haber',
      name: 'Haber',
      streamUrl: 'https://cdn.example/live/index.m3u8?token=abc',
      logoUrl: 'https://img.example/haber.png',
    }
    const extensionless = {
      ...hls,
      id: 'direct',
      streamUrl: 'https://cdn.example/live/stream?token=abc',
    }

    expect(playerPreferenceForIptvChannel(hls)).toBe('hls')
    expect(playerPreferenceForIptvChannel(extensionless)).toBe('auto')
    expect(playerRequestForIptvChannel(10, hls)).toEqual({
      id: 11,
      url: hls.streamUrl,
      preference: 'hls',
      title: 'Haber',
      thumbnailUrl: 'https://img.example/haber.png',
    })
  })

  it('increments request ids for repeated requests to the same URL', () => {
    const first = createPlayerOpenRequest(1, {
      url: 'https://example.com/live.m3u8',
      preference: 'hls',
    })
    const second = createPlayerOpenRequest(first.id, {
      url: first.url,
      preference: first.preference,
    })

    expect(first.id).toBe(2)
    expect(second.id).toBe(3)
  })
})
