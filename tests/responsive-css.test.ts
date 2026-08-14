import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('LiveTV simple watch responsive CSS regressions', () => {
  it('keeps the main watch surface centered and the viewport cinematic', () => {
    const css = readFileSync('apps/web/src/styles.css', 'utf8')

    expect(css).toMatch(
      /\.simple-watch-main\s*\{[^}]*max-width:\s*1280px;[^}]*margin:\s*0 auto;/s,
    )
    expect(css).toMatch(
      /\.unified-player-viewport\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9;/s,
    )
  })

  it('stacks the URL and action controls on narrow screens', () => {
    const css = readFileSync('apps/web/src/styles.css', 'utf8')

    expect(css).toMatch(
      /@media \(max-width: 768px\)[\s\S]*?\.player-source-input-row\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    )
  })
})
