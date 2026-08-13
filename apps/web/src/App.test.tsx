import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renders the responsive LiveTV P1 shell with accessible navigation', () => {
    const markup = renderToStaticMarkup(<App initialPath="/" />)

    expect(markup).toContain('class="app-shell"')
    expect(markup).toContain('href="#main-content"')
    expect(markup).toContain('aria-label="Ana navigasyon"')
    expect(markup).toContain('class="mobile-bottom-nav"')
    expect(markup).toContain('Ne izlemek istersin?')
    expect(markup).toContain('unified-player')
    expect(markup).toContain('Medya URL’si')
    expect(markup).toContain('Kaynağı aç')
  })

  it('renders route-specific context without changing the player shell', () => {
    const markup = renderToStaticMarkup(<App initialPath="/torrent" />)

    expect(markup).toContain('Torrent')
    expect(markup).toContain('Magnet bağlantısı')
    expect(markup).toContain('aria-current="page"')
    expect(markup).toContain('unified-player')
  })

  it('exposes featured live YouTube channels and Premium session support', () => {
    const markup = renderToStaticMarkup(<App initialPath="/youtube" />)

    expect(markup).toContain('Halk TV')
    expect(markup).toContain('@Halktvkanali')
    expect(markup).toContain('ANKA Haber')
    expect(markup).toContain('@ankahaberajans')
    expect(markup).toContain('YouTube Premium oturumunu kullan')
    expect(markup).toContain('Premium')
    expect(markup).toContain('P3 oynatma + kütüphane hazır')
    expect(markup).not.toContain('P2 oynatma hazır')
  })

  it('renders a dedicated settings shell', () => {
    const markup = renderToStaticMarkup(<App initialPath="/settings" />)

    expect(markup).toContain('class="settings-shell"')
    expect(markup).toContain('Görünüm ve tema')
    expect(markup).toContain('Başlangıç davranışı')
    expect(markup).toContain('Uygulama ve PWA')
    expect(markup).toContain('YouTube hesabı ve Premium')
    expect(markup).toContain('P3’te')
    expect(markup).not.toContain('P2’de')
    expect(markup).not.toContain('unified-player')
  })
})
