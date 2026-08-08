import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { App } from './App'

describe('App', () => {
  it('renders the LiveTV P0 foundation status', () => {
    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('<main')
    expect(markup).toContain('LiveTV')
    expect(markup).toContain('P0 foundation')
  })
})
