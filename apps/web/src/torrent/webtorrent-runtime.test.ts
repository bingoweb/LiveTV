import { describe, expect, it, vi } from 'vitest'

import {
  createBrowserWebTorrentRuntime,
  type WebTorrentConstructorLike,
} from './webtorrent-runtime'

class FakeClient {
  static WEBRTC_SUPPORT = true
  static lastInstance: FakeClient | null = null
  listeners = new Map<string, (...args: unknown[]) => void>()
  createServerCalls: unknown[] = []
  addCalls: unknown[] = []
  removeCalls: unknown[] = []
  destroyCalls = 0

  constructor() {
    FakeClient.lastInstance = this
  }

  on(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.set(event, listener)
  }

  off(event: string) {
    this.listeners.delete(event)
  }

  createServer(options: unknown) {
    this.createServerCalls.push(options)
    return {}
  }

  add(source: unknown, options: unknown) {
    this.addCalls.push([source, options])
    return { id: 'torrent' }
  }

  remove(
    torrent: unknown,
    options: unknown,
    callback: (error?: Error) => void,
  ) {
    this.removeCalls.push([torrent, options])
    callback()
  }

  destroy(callback: (error?: Error) => void) {
    this.destroyCalls += 1
    callback()
  }
}

function registration(state: ServiceWorkerState = 'activated') {
  return {
    scope: 'http://localhost:8080/webtorrent/',
    active: { state },
    installing: null,
    waiting: null,
  } as unknown as ServiceWorkerRegistration
}

describe('browser WebTorrent runtime', () => {
  it('fails locally when service workers are unavailable', async () => {
    await expect(
      createBrowserWebTorrentRuntime({
        serviceWorkers: null,
        loadWebTorrent: async () =>
          FakeClient as unknown as WebTorrentConstructorLike,
      }),
    ).rejects.toThrow('Service Worker')
  })

  it('fails locally when WebRTC support is unavailable', async () => {
    class UnsupportedClient extends FakeClient {
      static override WEBRTC_SUPPORT = false
    }

    await expect(
      createBrowserWebTorrentRuntime({
        serviceWorkers: {
          register: vi.fn(async () => registration()),
        },
        loadWebTorrent: async () =>
          UnsupportedClient as unknown as WebTorrentConstructorLike,
      }),
    ).rejects.toThrow('WebRTC')
  })

  it('registers the narrow worker and creates one browser server with it', async () => {
    const register = vi.fn(async () => registration())
    const runtime = await createBrowserWebTorrentRuntime({
      serviceWorkers: { register },
      loadWebTorrent: async () =>
        FakeClient as unknown as WebTorrentConstructorLike,
    })

    expect(register).toHaveBeenCalledWith('/webtorrent/sw.js', {
      scope: '/webtorrent/',
    })
    expect(FakeClient.lastInstance?.createServerCalls).toEqual([
      {
        controller: expect.objectContaining({
          scope: expect.stringContaining('/webtorrent/'),
        }),
      },
    ])
    expect(FakeClient.lastInstance?.listeners.has('error')).toBe(true)
  })

  it('waits for the returned registration worker to activate', async () => {
    let state: ServiceWorkerState = 'installing'
    const callbacks: { stateChange?: () => void } = {}
    const worker = {
      get state() {
        return state
      },
      addEventListener: (_event: string, listener: () => void) => {
        callbacks.stateChange = listener
      },
      removeEventListener: vi.fn(),
    }
    const pendingRegistration = {
      scope: 'http://localhost:8080/webtorrent/',
      active: null,
      waiting: null,
      installing: worker,
    } as unknown as ServiceWorkerRegistration

    const promise = createBrowserWebTorrentRuntime({
      serviceWorkers: { register: vi.fn(async () => pendingRegistration) },
      loadWebTorrent: async () =>
        FakeClient as unknown as WebTorrentConstructorLike,
    })
    await Promise.resolve()
    state = 'activated'
    callbacks.stateChange?.()

    await expect(promise).resolves.toMatchObject({ supported: true })
  })

  it('adds deselected ephemeral torrents and removes them with store destruction', async () => {
    const runtime = await createBrowserWebTorrentRuntime({
      serviceWorkers: { register: vi.fn(async () => registration()) },
      loadWebTorrent: async () =>
        FakeClient as unknown as WebTorrentConstructorLike,
    })

    const torrent = runtime.add('magnet:?xt=urn:btih:abc')
    expect(FakeClient.lastInstance?.addCalls).toEqual([
      [
        'magnet:?xt=urn:btih:abc',
        { deselect: true, destroyStoreOnDestroy: true },
      ],
    ])

    await runtime.remove(torrent)
    expect(FakeClient.lastInstance?.removeCalls).toEqual([
      [torrent, { destroyStore: true }],
    ])
    await runtime.destroy()
    expect(FakeClient.lastInstance?.destroyCalls).toBe(1)
  })
})
