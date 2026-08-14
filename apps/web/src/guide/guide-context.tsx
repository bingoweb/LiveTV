import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react'

import { useIptv } from '../iptv/iptv-context'
import { createGuideController, type GuideSnapshot } from './guide-controller'

export type GuideControllerLike = {
  getSnapshot(): GuideSnapshot
  subscribe(listener: () => void): () => void
  initialize(input: {
    lists: ReturnType<typeof useIptv>['lists']
    activeListId: string | null
    channels: ReturnType<typeof useIptv>['channels']
  }): Promise<void>
  setIptvState(input: {
    lists: ReturnType<typeof useIptv>['lists']
    activeListId: string | null
    channels: ReturnType<typeof useIptv>['channels']
  }): Promise<void>
  refresh(options?: {
    force?: boolean
    switchToUrlMode?: boolean
  }): Promise<void>
  importFile(file: File): Promise<void>
  selectDate(dateKey: string): void
}

export type GuideContextValue = GuideSnapshot & {
  initialize(): Promise<void>
  refresh(options?: {
    force?: boolean
    switchToUrlMode?: boolean
  }): Promise<void>
  importFile(file: File): Promise<void>
  selectDate(dateKey: string): void
  selectList(id: string | null): Promise<void>
}

const GuideContext = createContext<GuideContextValue | null>(null)

type GuideProviderProps = PropsWithChildren<{
  controllerFactory?: () => GuideControllerLike
}>

export function GuideProvider({
  children,
  controllerFactory = createGuideController,
}: GuideProviderProps) {
  const iptv = useIptv()
  const [controller] = useState(() => controllerFactory())
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )

  useEffect(() => {
    void controller.setIptvState({
      lists: iptv.lists,
      activeListId: iptv.activeListId,
      channels: iptv.channels,
    })
  }, [controller, iptv.activeListId, iptv.channels, iptv.lists])

  const value = useMemo<GuideContextValue>(
    () => ({
      ...snapshot,
      initialize: () =>
        controller.initialize({
          lists: iptv.lists,
          activeListId: iptv.activeListId,
          channels: iptv.channels,
        }),
      refresh: (options) => controller.refresh(options),
      importFile: (file) => controller.importFile(file),
      selectDate: (dateKey) => controller.selectDate(dateKey),
      selectList: (id) => iptv.selectList(id),
    }),
    [controller, iptv, snapshot],
  )

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>
}

export function useGuide() {
  const context = useContext(GuideContext)
  if (!context) throw new Error('useGuide, GuideProvider içinde kullanılmalı.')
  return context
}
