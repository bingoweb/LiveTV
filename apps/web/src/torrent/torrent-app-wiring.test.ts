import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('P5 torrent code remains dormant behind the simple watch entry path', () => {
  it('keeps torrent/library orchestration out of App', () => {
    const app = readFileSync('apps/web/src/App.tsx', 'utf8')

    expect(app).toContain('<UnifiedPlayer />')
    expect(app).not.toContain('playerRequestForTorrentPlayback')
    expect(app).not.toContain('playbackRequestForLibrarySource')
    expect(app).not.toContain('TorrentProvider')
    expect(app).not.toContain('torrentReplayRequest')
  })

  it('passes torrent playback and replay props through RouteContent', () => {
    const routeContent = readFileSync(
      'apps/web/src/components/RouteContent.tsx',
      'utf8',
    )

    expect(routeContent).toContain('onPlayTorrentDescriptor')
    expect(routeContent).toContain('torrentReplayRequest')
    expect(routeContent).toContain('onPlayDescriptor={onPlayTorrentDescriptor}')
    expect(routeContent).toContain('replayRequest={torrentReplayRequest}')
  })

  it('keeps torrent/library state out of the visible UnifiedPlayer', () => {
    const unifiedPlayer = readFileSync(
      'apps/web/src/components/UnifiedPlayer.tsx',
      'utf8',
    )

    expect(unifiedPlayer).not.toContain('resolvePlayerLibrarySource')
    expect(unifiedPlayer).not.toContain('librarySourceOverride')
    expect(unifiedPlayer).not.toContain('Torrent')
  })
})
