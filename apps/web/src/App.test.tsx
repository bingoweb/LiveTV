import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renders one simple watch surface without product navigation', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('LiveTV')
    expect(markup).toContain('unified-player')
    expect(markup).toContain('Medya URL’si')
    expect(markup).not.toContain('aria-label="Ana navigasyon"')
    expect(markup).not.toContain('class="mobile-bottom-nav"')
    expect(markup).not.toContain('Ne izlemek istersin?')
    expect(markup).not.toContain('IPTV / M3U kütüphanesi')
    expect(markup).not.toContain('TV rehberi yükleniyor')
    expect(markup).not.toContain('settings-shell')
    expect(markup).not.toContain('XMLTV TV Guide')
  })
})
