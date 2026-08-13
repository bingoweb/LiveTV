const UPDATE_READY_EVENT = 'livetv:update-ready'

function announceUpdate(worker: ServiceWorker) {
  window.dispatchEvent(
    new CustomEvent<ServiceWorker>(UPDATE_READY_EVENT, { detail: worker }),
  )
}

export function registerServiceWorker() {
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    !window.isSecureContext
  ) {
    return
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((registration) => {
        if (registration.waiting) announceUpdate(registration.waiting)

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing
          if (!worker) return

          worker.addEventListener('statechange', () => {
            if (
              worker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              announceUpdate(worker)
            }
          })
        })
      })
      .catch((error: unknown) => {
        console.warn('LiveTV service worker kaydı başarısız oldu.', error)
      })
  })
}

export { UPDATE_READY_EVENT }
