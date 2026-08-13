import { describe, expect, it } from 'vitest'

import { buildYouTubePlyrOptions, toHlsQualities } from './player-config'

describe('buildYouTubePlyrOptions', () => {
  it('keeps autoplay off and sends the current origin to YouTube', () => {
    const options = buildYouTubePlyrOptions('https://player.example.com')

    expect(options.autoplay).toBe(false)
    expect(options.youtube).toMatchObject({
      noCookie: true,
      origin: 'https://player.example.com',
    })
  })

  it('uses the signed-in YouTube domain when Premium session mode is enabled', () => {
    const options = buildYouTubePlyrOptions(
      'https://player.example.com',
      'premium-session',
    )

    expect(options.youtube).toMatchObject({
      noCookie: false,
      origin: 'https://player.example.com',
    })
  })
})

describe('toHlsQualities', () => {
  it('adds Auto and produces readable unique quality choices', () => {
    expect(
      toHlsQualities([
        { height: 1080, bitrate: 5_000_000 },
        { height: 720, bitrate: 2_500_000 },
        { height: 720, bitrate: 2_000_000 },
      ]),
    ).toEqual([
      { id: -1, label: 'Auto' },
      { id: 0, label: '1080p', height: 1080, bitrate: 5_000_000 },
      { id: 1, label: '720p', height: 720, bitrate: 2_500_000 },
    ])
  })
})
