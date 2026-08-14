import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { UnifiedPlayer } from './UnifiedPlayer'

describe('UnifiedPlayer', () => {
  it('renders only the simple URL-to-player controls', () => {
    const markup = renderToStaticMarkup(<UnifiedPlayer />)

    expect(markup).toContain('Medya URL’si')
    expect(markup).toContain('Yükle ve İzle')
    expect(markup).toContain('unified-player-viewport')
    expect(markup).toContain('İzlemek istediğin bağlantıyı yapıştır.')

    expect(markup).not.toContain('Motor')
    expect(markup).not.toContain('Premium')
    expect(markup).not.toContain('Kalite')
    expect(markup).not.toContain('Favoriye ekle')
    expect(markup).not.toContain('Yeni playlist')
    expect(markup).not.toContain('Canlı yayınlar')
    expect(markup).not.toContain('Halk TV')
    expect(markup).not.toContain('ANKA Haber')
    expect(markup).not.toContain('type="file"')
  })
})
