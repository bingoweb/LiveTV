export type InstallOutcome = 'accepted' | 'dismissed'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: InstallOutcome; platform: string }>
}

export function isStandaloneDisplayMode() {
  if (typeof window === 'undefined') return false

  const standaloneMedia = window.matchMedia(
    '(display-mode: standalone)',
  ).matches
  const navigatorWithStandalone = navigator as Navigator & {
    standalone?: boolean
  }

  return standaloneMedia || navigatorWithStandalone.standalone === true
}
