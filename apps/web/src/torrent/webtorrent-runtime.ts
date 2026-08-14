import { PWA_WORKER_SCOPE, PWA_WORKER_URL } from './webtorrent-worker-config'

export type TorrentRuntimeFile = {
  name: string
  path: string
  length: number
  type: string
  progress: number
  streamURL: string
  select(): void
  deselect(): void
}

export type TorrentRuntimeTorrent = {
  infoHash: string
  magnetURI: string
  name: string
  files: TorrentRuntimeFile[]
  numPeers: number
  progress: number
  downloadSpeed: number
  uploadSpeed: number
  downloaded: number
  uploaded: number
  timeRemaining: number
  on(event: string, listener: (...args: unknown[]) => void): unknown
  off(event: string, listener: (...args: unknown[]) => void): unknown
}

type WebTorrentClientLike = {
  on(event: string, listener: (...args: unknown[]) => void): unknown
  off(event: string, listener: (...args: unknown[]) => void): unknown
  createServer(options: { controller: ServiceWorkerRegistration }): unknown
  add(
    source: string | Uint8Array,
    options: { deselect: boolean; destroyStoreOnDestroy: boolean },
  ): TorrentRuntimeTorrent
  remove(
    torrent: TorrentRuntimeTorrent,
    options: { destroyStore: boolean },
    callback: (error?: Error) => void,
  ): unknown
  destroy(callback: (error?: Error) => void): unknown
}

export type WebTorrentConstructorLike = {
  readonly WEBRTC_SUPPORT: boolean
  new (): WebTorrentClientLike
}

export type TorrentRuntime = {
  readonly supported: boolean
  add(source: string | Uint8Array): TorrentRuntimeTorrent
  remove(torrent: TorrentRuntimeTorrent): Promise<void>
  destroy(): Promise<void>
  onError(listener: (error: Error) => void): () => void
}

type ServiceWorkerContainerLike = {
  register(
    scriptURL: string,
    options?: RegistrationOptions,
  ): Promise<ServiceWorkerRegistration>
}

type BrowserRuntimeOptions = {
  serviceWorkers?: ServiceWorkerContainerLike | null
  loadWebTorrent?: () => Promise<WebTorrentConstructorLike>
}

async function defaultLoadWebTorrent(): Promise<WebTorrentConstructorLike> {
  // WebTorrent ships a browser-ready ESM bundle but no TypeScript declaration for
  // this distribution entry. Keeping the import literal lets Vite split it lazily.
  // @ts-expect-error -- browser distribution intentionally has no .d.ts file
  const module = await import('webtorrent/dist/webtorrent.min.js')
  return module.default as WebTorrentConstructorLike
}

async function waitForActivatedRegistration(
  registration: ServiceWorkerRegistration,
) {
  if (registration.active?.state === 'activated') return

  const worker =
    registration.installing ?? registration.waiting ?? registration.active
  if (!worker) {
    throw new Error('WebTorrent Service Worker etkinleştirilemedi.')
  }
  if (worker.state === 'activated') return

  await new Promise<void>((resolve, reject) => {
    const handleStateChange = () => {
      if (worker.state === 'activated') {
        cleanup()
        resolve()
      } else if (worker.state === 'redundant') {
        cleanup()
        reject(new Error('WebTorrent Service Worker devre dışı kaldı.'))
      }
    }
    const cleanup = () => {
      worker.removeEventListener('statechange', handleStateChange)
    }
    worker.addEventListener('statechange', handleStateChange)
  })
}

function callbackPromise(
  operation: (callback: (error?: Error) => void) => unknown,
) {
  return new Promise<void>((resolve, reject) => {
    operation((error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

export async function createBrowserWebTorrentRuntime(
  options: BrowserRuntimeOptions = {},
): Promise<TorrentRuntime> {
  const serviceWorkers =
    options.serviceWorkers ??
    (typeof navigator !== 'undefined' ? navigator.serviceWorker : null)
  if (!serviceWorkers) {
    throw new Error('Browser WebTorrent için Service Worker desteği gerekiyor.')
  }

  const WebTorrent = await (options.loadWebTorrent ?? defaultLoadWebTorrent)()
  if (!WebTorrent.WEBRTC_SUPPORT) {
    throw new Error('Bu tarayıcı Browser WebTorrent için WebRTC desteklemiyor.')
  }

  const registration = await serviceWorkers.register(PWA_WORKER_URL, {
    scope: PWA_WORKER_SCOPE,
  })
  await waitForActivatedRegistration(registration)

  const client = new WebTorrent()
  const errorListeners = new Set<(error: Error) => void>()
  const handleClientError = (...args: unknown[]) => {
    const candidate = args[0]
    const error =
      candidate instanceof Error
        ? candidate
        : new Error('WebTorrent istemci hatası.', { cause: candidate })
    for (const listener of errorListeners) listener(error)
  }
  client.on('error', handleClientError)
  client.createServer({ controller: registration })

  let destroyed = false
  return {
    supported: true,
    add(source) {
      if (destroyed) throw new Error('WebTorrent runtime kapatıldı.')
      return client.add(source, {
        deselect: true,
        destroyStoreOnDestroy: true,
      })
    },
    async remove(torrent) {
      if (destroyed) return
      await callbackPromise((callback) =>
        client.remove(torrent, { destroyStore: true }, callback),
      )
    },
    async destroy() {
      if (destroyed) return
      destroyed = true
      client.off('error', handleClientError)
      await callbackPromise((callback) => client.destroy(callback))
      errorListeners.clear()
    },
    onError(listener) {
      errorListeners.add(listener)
      return () => errorListeners.delete(listener)
    },
  }
}
