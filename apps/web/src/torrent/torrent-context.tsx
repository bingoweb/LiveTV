import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

import {
  TorrentController,
  type TorrentPlaybackDescriptor,
  type TorrentSnapshot,
} from './torrent-controller'
import { replayTorrentSource } from './torrent-replay'

export type TorrentControllerLike = {
  getSnapshot(): TorrentSnapshot
  subscribe(listener: () => void): () => void
  openTextSource(input: string, preferredFilePath?: string): Promise<void>
  openTorrentFile(file: File, preferredFilePath?: string): Promise<void>
  selectFile(path: string): Promise<TorrentPlaybackDescriptor>
  stop(): Promise<void>
  destroy(): Promise<void>
}

export type TorrentContextValue = TorrentSnapshot & {
  openTextSource(input: string, preferredFilePath?: string): Promise<void>
  openTorrentFile(file: File, preferredFilePath?: string): Promise<void>
  selectFile(path: string): Promise<TorrentPlaybackDescriptor>
  replaySource(
    magnetUri: string,
    filePath: string,
  ): Promise<TorrentPlaybackDescriptor>
  stop(): Promise<void>
}

const TorrentContext = createContext<TorrentContextValue | null>(null)

type TorrentProviderProps = PropsWithChildren<{
  controllerFactory?: () => TorrentControllerLike
}>

export function TorrentProvider({
  children,
  controllerFactory = () => new TorrentController(),
}: TorrentProviderProps) {
  const [controller] = useState(() => controllerFactory())
  const snapshot = useSyncExternalStore(
    controller.subscribe.bind(controller),
    controller.getSnapshot.bind(controller),
    controller.getSnapshot.bind(controller),
  )

  useEffect(
    () => () => {
      void controller.destroy()
    },
    [controller],
  )

  const value = useMemo<TorrentContextValue>(
    () => ({
      ...snapshot,
      openTextSource: (input, preferredFilePath) =>
        controller.openTextSource(input, preferredFilePath),
      openTorrentFile: (file, preferredFilePath) =>
        controller.openTorrentFile(file, preferredFilePath),
      selectFile: (path) => controller.selectFile(path),
      replaySource: (magnetUri, filePath) =>
        replayTorrentSource(controller, magnetUri, filePath),
      stop: () => controller.stop(),
    }),
    [controller, snapshot],
  )

  return (
    <TorrentContext.Provider value={value}>{children}</TorrentContext.Provider>
  )
}

export function useTorrent() {
  const context = useContext(TorrentContext)
  if (!context)
    throw new Error('useTorrent, TorrentProvider içinde kullanılmalı.')
  return context
}
