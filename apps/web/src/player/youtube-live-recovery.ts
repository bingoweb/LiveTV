type ResolveYouTubeLive = (
  channelUrl: string,
  options: { refresh: boolean },
) => Promise<string>

type LoadPlayerSource<T> = (playableUrl: string) => Promise<T>

export async function loadYouTubeChannelWithRecovery<T>(
  channelUrl: string,
  resolveLive: ResolveYouTubeLive,
  load: LoadPlayerSource<T>,
) {
  const playableUrl = await resolveLive(channelUrl, { refresh: true })
  try {
    return await load(playableUrl)
  } catch {
    const refreshedUrl = await resolveLive(channelUrl, { refresh: true })
    return load(refreshedUrl)
  }
}
