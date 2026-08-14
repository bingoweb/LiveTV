import { UnifiedPlayer } from './components/UnifiedPlayer'
import { LibraryProvider } from './library/library-context'
import { resolveRoute } from './navigation'

const watchRoute = resolveRoute('/')

export function App() {
  return (
    <LibraryProvider>
      <div className="simple-watch-app">
        <a className="skip-link" href="#main-content">
          İçeriğe geç
        </a>

        <header className="simple-watch-header">
          <a
            className="simple-watch-brand"
            href="/"
            aria-label="LiveTV ana sayfa"
          >
            LiveTV
          </a>
        </header>

        <main id="main-content" className="simple-watch-main" tabIndex={-1}>
          <UnifiedPlayer route={watchRoute} />
        </main>
      </div>
    </LibraryProvider>
  )
}
