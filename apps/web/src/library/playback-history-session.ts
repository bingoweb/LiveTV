import type { LibrarySource } from './library-types'

export type PlaybackHistoryState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'error'

export function shouldRecordPlayback(
  previousRecordedSourceKey: string | null,
  state: PlaybackHistoryState,
  source: LibrarySource | null,
) {
  if (!source) {
    return { record: false, nextRecordedSourceKey: null }
  }

  if (state !== 'playing' || previousRecordedSourceKey === source.sourceKey) {
    return {
      record: false,
      nextRecordedSourceKey: previousRecordedSourceKey,
    }
  }

  return { record: true, nextRecordedSourceKey: source.sourceKey }
}
