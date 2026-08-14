import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('LiveTV responsive CSS regressions', () => {
  it('gives short landscape phone screens a single full-width player column', () => {
    const css = readFileSync('apps/web/src/styles.css', 'utf8')
    const marker =
      '@media (max-height: 500px) and (max-width: 900px) and (orientation: landscape) {'
    const start = css.indexOf(marker)
    const nextMedia =
      start === -1 ? -1 : css.indexOf('@media', start + marker.length)
    const landscapePhoneRule =
      start === -1
        ? ''
        : css.slice(start, nextMedia === -1 ? undefined : nextMedia)

    expect(start).toBeGreaterThanOrEqual(0)
    expect(landscapePhoneRule).toContain('.desktop-sidebar')
    expect(landscapePhoneRule).toContain(
      'grid-template-columns: minmax(0, 1fr)',
    )
  })

  it('keeps the seven-day guide strip horizontally scrollable and guide rows shrink-safe', () => {
    const css = readFileSync('apps/web/src/styles.css', 'utf8')

    expect(css).toMatch(/\.guide-date-strip\s*\{[^}]*overflow-x:\s*auto;/s)
    expect(css).toMatch(/\.guide-channel-row\s*\{[^}]*min-width:\s*0;/s)
    expect(css).toMatch(
      /@media \(max-width: 768px\)[\s\S]*?\.guide-now-next\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    )
  })
})
