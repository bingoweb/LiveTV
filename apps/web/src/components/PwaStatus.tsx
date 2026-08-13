import { useEffect, useState } from 'react'

import {
  type BeforeInstallPromptEvent,
  isStandaloneDisplayMode,
} from '../pwa/install'
import { UPDATE_READY_EVENT } from '../pwa/register-service-worker'

export function PwaStatus() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [updateWorker, setUpdateWorker] = useState<ServiceWorker | null>(null)

  useEffect(() => {
    setInstalled(isStandaloneDisplayMode())

    const handleInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent
      promptEvent.preventDefault()
      setInstallPrompt(promptEvent)
    }

    const handleInstalled = () => {
      setInstallPrompt(null)
      setInstalled(true)
    }

    const handleUpdate = (event: Event) => {
      setUpdateWorker((event as CustomEvent<ServiceWorker>).detail)
    }

    window.addEventListener('beforeinstallprompt', handleInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    window.addEventListener(UPDATE_READY_EVENT, handleUpdate)

    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
      window.removeEventListener(UPDATE_READY_EVENT, handleUpdate)
    }
  }, [])

  const install = async () => {
    if (!installPrompt) return

    await installPrompt.prompt()
    const { outcome } = await installPrompt.userChoice
    if (outcome === 'accepted') setInstallPrompt(null)
  }

  const applyUpdate = () => {
    if (!updateWorker) return

    let reloaded = false
    navigator.serviceWorker.addEventListener(
      'controllerchange',
      () => {
        if (reloaded) return
        reloaded = true
        window.location.reload()
      },
      { once: true },
    )

    updateWorker.postMessage({ type: 'SKIP_WAITING' })
  }

  if (updateWorker) {
    return (
      <button
        className="secondary-button pwa-action"
        type="button"
        onClick={applyUpdate}
      >
        Güncellemeyi yükle
      </button>
    )
  }

  if (installPrompt) {
    return (
      <button
        className="secondary-button pwa-action"
        type="button"
        onClick={() => void install()}
      >
        LiveTV’yi kur
      </button>
    )
  }

  return (
    <span className="pwa-capability-status">
      {installed
        ? 'Uygulama olarak çalışıyor'
        : 'Tarayıcı kurulumu destekleniyorsa hazır'}
    </span>
  )
}
