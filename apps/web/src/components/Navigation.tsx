import { useState } from 'react'

import { appMeta } from '../app-meta'
import { navigationItems, type NavigationItem } from '../navigation'
import { AppIcon } from './AppIcon'

type NavigationProps = {
  activeRoute: NavigationItem
  onNavigate: (path: string) => void
}

function NavLink({
  item,
  activeRoute,
  onNavigate,
}: {
  item: NavigationItem
  activeRoute: NavigationItem
  onNavigate: (path: string) => void
}) {
  const isActive = activeRoute.id === item.id

  return (
    <a
      className={`nav-link${isActive ? ' is-active' : ''}`}
      href={item.path}
      aria-current={isActive ? 'page' : undefined}
      onClick={(event) => {
        event.preventDefault()
        onNavigate(item.path)
      }}
    >
      <span className="nav-icon">
        <AppIcon name={item.icon} />
      </span>
      <span className="nav-label">{item.label}</span>
    </a>
  )
}

function DesktopNavigation({ activeRoute, onNavigate }: NavigationProps) {
  return (
    <aside className="desktop-sidebar">
      <a
        className="brand"
        href="/"
        aria-label="LiveTV ana sayfa"
        onClick={(event) => {
          event.preventDefault()
          onNavigate('/')
        }}
      >
        <span className="brand-mark" aria-hidden="true">
          <span className="brand-play" />
        </span>
        <span className="brand-copy">
          <strong>{appMeta.name}</strong>
          <small>{appMeta.tagline}</small>
        </span>
      </a>

      <nav className="desktop-nav" aria-label="Ana navigasyon">
        {navigationItems.map((item) => (
          <NavLink
            key={item.id}
            item={item}
            activeRoute={activeRoute}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="phase-card">
          <span className="phase-chip">{appMeta.phase}</span>
          <div>
            <strong>Guest local library</strong>
            <small>Geçmiş, favoriler ve playlistler cihazda kalıcı.</small>
          </div>
        </div>
      </div>
    </aside>
  )
}

function MobileNavigation({ activeRoute, onNavigate }: NavigationProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const primaryItems = navigationItems.filter(
    ({ mobilePrimary }) => mobilePrimary,
  )
  const secondaryItems = navigationItems.filter(
    ({ mobilePrimary }) => !mobilePrimary,
  )

  const navigateAndClose = (path: string) => {
    onNavigate(path)
    setMoreOpen(false)
  }

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Mobil ana navigasyon">
        {primaryItems.map((item) => {
          const isActive = activeRoute.id === item.id

          return (
            <a
              key={item.id}
              className={`mobile-nav-item${isActive ? ' is-active' : ''}`}
              href={item.path}
              aria-current={isActive ? 'page' : undefined}
              onClick={(event) => {
                event.preventDefault()
                navigateAndClose(item.path)
              }}
            >
              <AppIcon name={item.icon} size={21} />
              <span>{item.shortLabel}</span>
            </a>
          )
        })}

        <button
          className={`mobile-nav-item${moreOpen ? ' is-active' : ''}`}
          type="button"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-sheet"
          onClick={() => setMoreOpen((current) => !current)}
        >
          <AppIcon name="more" size={21} />
          <span>Daha</span>
        </button>
      </nav>

      {moreOpen ? (
        <div
          className="mobile-sheet-backdrop"
          role="presentation"
          onClick={() => setMoreOpen(false)}
        >
          <section
            id="mobile-more-sheet"
            className="mobile-more-sheet"
            aria-label="Diğer bölümler"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" aria-hidden="true" />
            <div className="sheet-heading">
              <div>
                <span className="eyebrow">LiveTV</span>
                <h2>Diğer bölümler</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Menüyü kapat"
                onClick={() => setMoreOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="mobile-secondary-grid">
              {secondaryItems.map((item) => {
                const isActive = activeRoute.id === item.id

                return (
                  <a
                    key={item.id}
                    className={`secondary-nav-card${isActive ? ' is-active' : ''}`}
                    href={item.path}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={(event) => {
                      event.preventDefault()
                      navigateAndClose(item.path)
                    }}
                  >
                    <AppIcon name={item.icon} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </a>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}

export function Navigation(props: NavigationProps) {
  return (
    <>
      <DesktopNavigation {...props} />
      <MobileNavigation {...props} />
    </>
  )
}
