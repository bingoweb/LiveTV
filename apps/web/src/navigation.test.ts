import { describe, expect, it } from 'vitest'

import { navigationItems, resolveRoute } from './navigation'

describe('navigation', () => {
  it('contains every approved top-level LiveTV section', () => {
    expect(navigationItems.map(({ path }) => path)).toEqual([
      '/',
      '/live',
      '/youtube',
      '/iptv',
      '/torrent',
      '/playlists',
      '/guide',
      '/history',
      '/settings',
    ])
  })

  it('resolves known paths and falls back to home', () => {
    expect(resolveRoute('/torrent').id).toBe('torrent')
    expect(resolveRoute('/settings').id).toBe('settings')
    expect(resolveRoute('/does-not-exist').id).toBe('home')
  })
})
