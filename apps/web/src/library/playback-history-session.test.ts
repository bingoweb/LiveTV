import { describe, expect, it } from 'vitest'

import type { LibrarySource } from './library-types'
import { shouldRecordPlayback } from './playback-history-session'

const first: LibrarySource = {
  sourceKey: 'youtube:dQw4w9WgXcQ',
  url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  kind: 'youtube',
  title: 'First',
}

const second: LibrarySource = {
  sourceKey: 'video:https://example.com/second.mp4',
  url: 'https://example.com/second.mp4',
  kind: 'video',
  title: 'Second',
}

describe('playback history session guard', () => {
  it('records only the first playing state for one loaded source', () => {
    expect(shouldRecordPlayback(null, 'ready', first)).toEqual({
      record: false,
      nextRecordedSourceKey: null,
    })

    const firstPlay = shouldRecordPlayback(null, 'playing', first)
    expect(firstPlay).toEqual({
      record: true,
      nextRecordedSourceKey: first.sourceKey,
    })

    expect(
      shouldRecordPlayback(
        firstPlay.nextRecordedSourceKey,
        'paused',
        first,
      ),
    ).toEqual({
      record: false,
      nextRecordedSourceKey: first.sourceKey,
    })

    expect(
      shouldRecordPlayback(
        firstPlay.nextRecordedSourceKey,
        'playing',
        first,
      ),
    ).toEqual({
      record: false,
      nextRecordedSourceKey: first.sourceKey,
    })
  })

  it('records a different loaded source and resets after source clear', () => {
    expect(shouldRecordPlayback(first.sourceKey, 'playing', second)).toEqual({
      record: true,
      nextRecordedSourceKey: second.sourceKey,
    })

    expect(shouldRecordPlayback(second.sourceKey, 'idle', null)).toEqual({
      record: false,
      nextRecordedSourceKey: null,
    })
  })
})
