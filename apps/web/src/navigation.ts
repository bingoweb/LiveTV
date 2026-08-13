export type NavigationIcon =
  | 'home'
  | 'live'
  | 'youtube'
  | 'iptv'
  | 'torrent'
  | 'playlists'
  | 'guide'
  | 'history'
  | 'settings'
  | 'more'

export type NavigationItem = {
  id:
    | 'home'
    | 'live'
    | 'youtube'
    | 'iptv'
    | 'torrent'
    | 'playlists'
    | 'guide'
    | 'history'
    | 'settings'
  label: string
  shortLabel: string
  description: string
  path: string
  icon: NavigationIcon
  mobilePrimary: boolean
}

export const navigationItems: readonly NavigationItem[] = [
  {
    id: 'home',
    label: 'Ana Sayfa',
    shortLabel: 'Ana Sayfa',
    description: 'Kaynaklara ve son oturumlara hızlı erişim',
    path: '/',
    icon: 'home',
    mobilePrimary: true,
  },
  {
    id: 'live',
    label: 'Canlı TV',
    shortLabel: 'Canlı',
    description: 'Canlı yayın kaynaklarını tek ekranda aç',
    path: '/live',
    icon: 'live',
    mobilePrimary: true,
  },
  {
    id: 'youtube',
    label: 'YouTube',
    shortLabel: 'YouTube',
    description: 'YouTube bağlantılarını LiveTV oynatıcısında aç',
    path: '/youtube',
    icon: 'youtube',
    mobilePrimary: false,
  },
  {
    id: 'iptv',
    label: 'IPTV',
    shortLabel: 'IPTV',
    description: 'M3U ve M3U8 kanal listelerini yönet',
    path: '/iptv',
    icon: 'iptv',
    mobilePrimary: true,
  },
  {
    id: 'torrent',
    label: 'Torrent',
    shortLabel: 'Torrent',
    description: 'Magnet veya torrent kaynağını doğrudan akışa hazırla',
    path: '/torrent',
    icon: 'torrent',
    mobilePrimary: true,
  },
  {
    id: 'playlists',
    label: 'Playlistler',
    shortLabel: 'Listeler',
    description: 'Karışık medya listelerini düzenle ve sırala',
    path: '/playlists',
    icon: 'playlists',
    mobilePrimary: false,
  },
  {
    id: 'guide',
    label: 'TV Rehberi',
    shortLabel: 'Rehber',
    description: 'EPG akışını ve yaklaşan programları görüntüle',
    path: '/guide',
    icon: 'guide',
    mobilePrimary: false,
  },
  {
    id: 'history',
    label: 'Geçmiş',
    shortLabel: 'Geçmiş',
    description: 'Son izlenen kaynaklara geri dön',
    path: '/history',
    icon: 'history',
    mobilePrimary: false,
  },
  {
    id: 'settings',
    label: 'Ayarlar',
    shortLabel: 'Ayarlar',
    description: 'LiveTV davranışını ve görünümünü yapılandır',
    path: '/settings',
    icon: 'settings',
    mobilePrimary: false,
  },
] as const

export function resolveRoute(pathname: string): NavigationItem {
  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  return (
    navigationItems.find(({ path }) => path === normalizedPath) ??
    navigationItems[0]!
  )
}
