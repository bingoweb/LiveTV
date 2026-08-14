import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('P5 torrent application wiring', () => {
  it('routes torrent playback descriptors and saved-source replays through App', () => {
    const app = readFileSync('apps/web/src/App.tsx', 'utf8')

    expect(app).toContain('playerRequestForTorrentPlayback')
    expect(app).toContain('playbackRequestForLibrarySource')
    expect(app).toContain('torrentReplayRequest')
    expect(app).toContain('onPlayTorrentDescriptor')
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

  it('keeps the stable torrent library source inside UnifiedPlayer', () => {
    const unifiedPlayer = readFileSync(
      'apps/web/src/components/UnifiedPlayer.tsx',
      'utf8',
    )

    expect(unifiedPlayer).toContain('resolvePlayerLibrarySource')
    expect(unifiedPlayer).toContain('librarySourceOverride')
  })
})
