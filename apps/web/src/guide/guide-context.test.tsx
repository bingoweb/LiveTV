import { readFileSync } from 'node:fs'

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { IptvProvider } from '../iptv/iptv-context'
import {
  GuideProvider,
  useGuide,
  type GuideControllerLike,
} from './guide-context'
import type { GuideSnapshot } from './guide-controller'

const snapshot: GuideSnapshot = {
  status: 'loading',
  activeListId: null,
  selectedDate: '2026-08-14',
  channels: [],
  unmatchedChannelCount: 0,
  refreshing: false,
}

function fakeController(): GuideControllerLike {
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    initialize: vi.fn(async () => {}),
    setIptvState: vi.fn(async () => {}),
    refresh: vi.fn(async () => {}),
    importFile: vi.fn(async () => {}),
    selectDate: vi.fn(),
  }
}

function Probe() {
  const guide = useGuide()
  return (
    <span>
      {guide.status}:{guide.selectedDate}
    </span>
  )
}

describe('GuideProvider', () => {
  it('pins one controller instance and does not auto-initialize guide work', () => {
    const source = readFileSync('apps/web/src/guide/guide-context.tsx', 'utf8')
    expect(source).toContain('useState(() => controllerFactory())')
    expect(source).not.toContain('void controller.initialize()')
  })

  it('renders from the lazy snapshot without starting guide network/cache initialization', () => {
    const controller = fakeController()
    const factory = vi.fn(() => controller)

    const markup = renderToStaticMarkup(
      <IptvProvider>
        <GuideProvider controllerFactory={factory}>
          <Probe />
        </GuideProvider>
      </IptvProvider>,
    )

    expect(markup).toContain('loading:2026-08-14')
    expect(factory).toHaveBeenCalledOnce()
    expect(vi.mocked(controller.initialize)).not.toHaveBeenCalled()
  })

  it('delegates guide list selection to the existing IPTV context', () => {
    const source = readFileSync('apps/web/src/guide/guide-context.tsx', 'utf8')
    expect(source).toContain('selectList: (id) => iptv.selectList(id)')
  })
})
