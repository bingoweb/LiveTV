import type { NavigationIcon } from '../navigation'

type AppIconProps = {
  name: NavigationIcon
  size?: number
}

export function AppIcon({ name, size = 22 }: AppIconProps) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  }

  switch (name) {
    case 'home':
      return (
        <svg {...commonProps}>
          <path d="M3.5 10.6 12 3.7l8.5 6.9" />
          <path d="M5.8 9.4v10.1h12.4V9.4M9.6 19.5v-5.4h4.8v5.4" />
        </svg>
      )
    case 'live':
      return (
        <svg {...commonProps}>
          <rect x="3.2" y="5.2" width="17.6" height="13.6" rx="3" />
          <path d="m10 9 5 3-5 3V9Z" />
          <path d="M8.2 2.8 12 5.2l3.8-2.4" />
        </svg>
      )
    case 'youtube':
      return (
        <svg {...commonProps}>
          <path d="M20.2 7.2a2.8 2.8 0 0 0-2-2C16.5 4.7 12 4.7 12 4.7s-4.5 0-6.2.5a2.8 2.8 0 0 0-2 2A26 26 0 0 0 3.3 12c0 1.6.2 3.2.5 4.8a2.8 2.8 0 0 0 2 2c1.7.5 6.2.5 6.2.5s4.5 0 6.2-.5a2.8 2.8 0 0 0 2-2c.3-1.6.5-3.2.5-4.8s-.2-3.2-.5-4.8Z" />
          <path d="m10.2 9 4.7 3-4.7 3V9Z" />
        </svg>
      )
    case 'iptv':
      return (
        <svg {...commonProps}>
          <rect x="3" y="5" width="18" height="12" rx="2.6" />
          <path d="M8 21h8M12 17v4" />
          <path d="M7 9h3M7 12h6M7 15h4" />
          <path d="m16 9.4 2.7 2-2.7 2v-4Z" />
        </svg>
      )
    case 'torrent':
      return (
        <svg {...commonProps}>
          <path d="M12 3v11" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5.2 17.3a7.7 7.7 0 0 0 13.6 0" />
          <circle cx="12" cy="18.3" r="1.2" />
        </svg>
      )
    case 'playlists':
      return (
        <svg {...commonProps}>
          <path d="M4 6h10M4 11h10M4 16h7" />
          <path d="M17 9v8.2a2.5 2.5 0 1 1-2-2.4" />
          <path d="m17 9 4-1.2v3.4L17 12" />
        </svg>
      )
    case 'guide':
      return (
        <svg {...commonProps}>
          <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
          <path d="M8 2.8v3.4M16 2.8v3.4M3 9h18M7 13h3M14 13h3M7 17h3M14 17h3" />
        </svg>
      )
    case 'history':
      return (
        <svg {...commonProps}>
          <path d="M4.3 8.2A8.8 8.8 0 1 1 3.4 13" />
          <path d="M3.4 5.2v4h4" />
          <path d="M12 7.5V12l3 2" />
        </svg>
      )
    case 'settings':
      return (
        <svg {...commonProps}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
      )
    case 'more':
      return (
        <svg {...commonProps}>
          <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
        </svg>
      )
  }
}
