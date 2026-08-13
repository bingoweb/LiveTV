import { describe, expect, it, vi } from 'vitest'

import { loadYouTubeChannelWithRecovery } from './youtube-live-recovery'

describe('loadYouTubeChannelWithRecovery', () => {
  it('forces one fresh resolution before a successful channel load', async () => {
    const resolveLive = vi
      .fn()
      .mockResolvedValue('https://www.youtube.com/watch?v=1uvsDurqSpM')
    const load = vi.fn().mockResolvedValue({ kind: 'youtube' })

    await expect(
      loadYouTubeChannelWithRecovery(
        'https://www.youtube.com/@Halktvkanali',
        resolveLive,
        load,
      ),
    ).resolves.toEqual({ kind: 'youtube' })

    expect(resolveLive).toHaveBeenCalledTimes(1)
    expect(resolveLive).toHaveBeenCalledWith(
      'https://www.youtube.com/@Halktvkanali',
      { refresh: true },
    )
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('rediscoveries once and retries once when the first player load fails', async () => {
    const resolveLive = vi
      .fn()
      .mockResolvedValueOnce('https://www.youtube.com/watch?v=OLDVIDEO001')
      .mockResolvedValueOnce('https://www.youtube.com/watch?v=NEWVIDEO002')
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('stale embed'))
      .mockResolvedValueOnce({ kind: 'youtube', videoId: 'NEWVIDEO002' })

    await expect(
      loadYouTubeChannelWithRecovery(
        'https://www.youtube.com/@Halktvkanali',
        resolveLive,
        load,
      ),
    ).resolves.toEqual({ kind: 'youtube', videoId: 'NEWVIDEO002' })

    expect(resolveLive).toHaveBeenCalledTimes(2)
    expect(resolveLive).toHaveBeenNthCalledWith(
      2,
      'https://www.youtube.com/@Halktvkanali',
      { refresh: true },
    )
    expect(load).toHaveBeenCalledTimes(2)
    expect(load).toHaveBeenNthCalledWith(
      2,
      'https://www.youtube.com/watch?v=NEWVIDEO002',
    )
  })
})
