import { UnifiedPlayer } from './components/UnifiedPlayer'

export function App() {
  return (
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
        <UnifiedPlayer />
      </main>
    </div>
  )
}
