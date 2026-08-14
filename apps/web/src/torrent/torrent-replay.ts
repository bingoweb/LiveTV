import type {
  TorrentPlaybackDescriptor,
  TorrentSnapshot,
} from './torrent-controller'

export type TorrentReplayRequest = {
  id: number
  magnetUri: string
  filePath: string
}

type TorrentReplayController = {
  getSnapshot(): TorrentSnapshot
  subscribe(listener: () => void): () => void
  openTextSource(input: string, preferredFilePath?: string): Promise<void>
  selectFile(path: string): Promise<TorrentPlaybackDescriptor>
}

export async function replayTorrentSource(
  controller: TorrentReplayController,
  magnetUri: string,
  filePath: string,
): Promise<TorrentPlaybackDescriptor> {
  return await new Promise<TorrentPlaybackDescriptor>((resolve, reject) => {
    let settled = false
    let selecting = false

    const cleanupAndReject = (error: unknown) => {
      if (settled) return
      settled = true
      unsubscribe()
      reject(
        error instanceof Error ? error : new Error('Torrent tekrar açılamadı.'),
      )
    }

    const inspect = () => {
      if (settled || selecting) return
      const snapshot = controller.getSnapshot()
      if (snapshot.status === 'error') {
        cleanupAndReject(
          new Error(snapshot.errorMessage ?? 'Torrent tekrar açılamadı.'),
        )
        return
      }
      if (snapshot.status !== 'ready' && snapshot.status !== 'streaming') return

      const file = snapshot.files.find(({ path }) => path === filePath)
      if (!file || file.mediaType === 'unsupported') {
        cleanupAndReject(
          new Error(
            'Kaydedilmiş torrent dosyası artık bu torrent içinde bulunamadı.',
          ),
        )
        return
      }

      selecting = true
      void controller
        .selectFile(filePath)
        .then((descriptor) => {
          if (settled) return
          settled = true
          unsubscribe()
          resolve(descriptor)
        })
        .catch(cleanupAndReject)
    }

    const unsubscribe = controller.subscribe(inspect)
    void controller
      .openTextSource(magnetUri, filePath)
      .then(inspect)
      .catch(cleanupAndReject)
  })
}
