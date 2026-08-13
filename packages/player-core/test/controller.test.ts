import { describe, expect, it, vi } from 'vitest'

import {
  PlayerController,
  type PlayerAdapter,
  type PlayerAdapterFactory,
  type PlayerSource,
} from '../src/index'

function adapterFactory(kind: PlayerSource['kind']) {
  const instances: PlayerAdapter[] = []
  const factory: PlayerAdapterFactory = () => {
    const adapter: PlayerAdapter = {
      kind,
      load: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      destroy: vi.fn().mockResolvedValue(undefined),
    }
    instances.push(adapter)
    return adapter
  }

  return { factory, instances }
}

describe('PlayerController', () => {
  it('destroys the previous adapter before switching source types', async () => {
    const direct = adapterFactory('direct')
    const youtube = adapterFactory('youtube')
    const hls = adapterFactory('hls')
    const controller = new PlayerController({
      direct: direct.factory,
      youtube: youtube.factory,
      hls: hls.factory,
    })

    await controller.load('https://example.com/movie.mp4')
    await controller.load('https://youtu.be/M7lc1UVf-VE')

    expect(direct.instances[0]?.destroy).toHaveBeenCalledOnce()
    expect(youtube.instances[0]?.load).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'youtube', videoId: 'M7lc1UVf-VE' }),
    )
  })

  it('delegates play and pause to the active adapter', async () => {
    const direct = adapterFactory('direct')
    const controller = new PlayerController({
      direct: direct.factory,
      youtube: adapterFactory('youtube').factory,
      hls: adapterFactory('hls').factory,
    })

    await controller.load('https://example.com/movie.mp4')
    await controller.play()
    controller.pause()

    expect(direct.instances[0]?.play).toHaveBeenCalledOnce()
    expect(direct.instances[0]?.pause).toHaveBeenCalledOnce()
  })

  it('passes an explicit HLS preference through for ambiguous URLs', async () => {
    const hls = adapterFactory('hls')
    const controller = new PlayerController({
      direct: adapterFactory('direct').factory,
      youtube: adapterFactory('youtube').factory,
      hls: hls.factory,
    })

    await controller.load('https://cdn.example.com/live?id=42', 'hls')

    expect(hls.instances[0]?.load).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'hls' }),
    )
  })
})
