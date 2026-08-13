import { useEffect, useRef, useState } from 'react'

import { Navigation } from './components/Navigation'
import { RouteContent } from './components/RouteContent'
import { SettingsShell } from './components/SettingsShell'
import { UnifiedPlayer } from './components/UnifiedPlayer'
import { LibraryProvider } from './library/library-context'
import {
  createPlayerOpenRequest,
  type PlayerOpenRequest,
} from './library/library-player-request'
import type { LibrarySource } from './library/library-types'
import { resolveRoute } from './navigation'

type AppProps = {
  initialPath?: string
}

function getInitialPath(initialPath?: string) {
  if (initialPath) return initialPath
  if (typeof window !== 'undefined') return window.location.pathname
  return '/'
}

export function App({ initialPath }: AppProps) {
  const [pathname, setPathname] = useState(() => getInitialPath(initialPath))
  const [playerOpenRequest, setPlayerOpenRequest] =
    useState<PlayerOpenRequest | null>(null)
  const playerRequestIdRef = useRef(0)
  const route = resolveRoute(pathname)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handlePopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = `${route.label} · LiveTV`
    }
  }, [route.label])

  const navigate = (nextPath: string) => {
    if (nextPath === route.path) return

    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', nextPath)
    }

    setPathname(nextPath)
  }

  const playLibrarySource = (source: LibrarySource) => {
    const request = createPlayerOpenRequest(playerRequestIdRef.current, source)
    playerRequestIdRef.current = request.id
    setPlayerOpenRequest(request)
  }

  return (
    <LibraryProvider>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">
          İçeriğe geç
        </a>

        <Navigation activeRoute={route} onNavigate={navigate} />

        <div className="app-main-column">
          <header className="topbar">
            <div className="topbar-copy">
              <span className="eyebrow">LiveTV</span>
              <h1>{route.label}</h1>
              <p>{route.description}</p>
            </div>

            <div className="topbar-status" aria-label="Sistem durumu">
              <span className="status-dot" aria-hidden="true" />
              <span>Hazır</span>
            </div>
          </header>

          <main id="main-content" className="workspace" tabIndex={-1}>
            <section
              className={`workspace-grid${route.id === 'settings' ? ' settings-layout' : ''}`}
              aria-label={`${route.label} çalışma alanı`}
            >
              {route.id === 'settings' ? (
                <SettingsShell />
              ) : (
                <>
                  <div className="context-column">
                    <RouteContent
                      route={route}
                      onNavigate={navigate}
                      onPlaySource={playLibrarySource}
                    />
                  </div>

                  <div className="player-column">
                    <UnifiedPlayer
                      route={route}
                      openRequest={playerOpenRequest}
                    />
                  </div>
                </>
              )}
            </section>
          </main>
        </div>
      </div>
    </LibraryProvider>
  )
}
