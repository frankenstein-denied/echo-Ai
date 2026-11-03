// Browser-safe music helpers: MUSIC context formatting, YouTube URLs, and ListenBrainz (public API, no key).
// No secrets here. Never log usernames.
const LB = 'https://api.listenbrainz.org/1'
export const MUSIC_MAX_CHARS = 400

export type ListeningTrack = { title: string; artist: string }
export type ListeningArtist = { name: string; plays: number }
export type Listening = { recent: ListeningTrack[]; topArtists: ListeningArtist[] }

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Short plain-text MUSIC block for the model, capped at MUSIC_MAX_CHARS. Empty when there is nothing to say. */
export function formatListening({ recent, topArtists }: Listening): string {
  const lines: string[] = []
  const top = topArtists.filter((a) => a.name).slice(0, 5)
  if (top.length) {
    lines.push('Top artists this week: ' + top.map((a, i) => (i === 0 ? `${clean(a.name)} (${a.plays} plays)` : `${clean(a.name)} (${a.plays})`)).join(', '))
  }
  const rec = recent.filter((t) => t.title)
  if (rec.length) {
    const prefix = 'Recently played: '
    const head = lines.length ? lines.join('\n') + '\n' : ''
    const items: string[] = []
    for (const t of rec.slice(0, 10)) {
      const item = t.artist ? `${clean(t.title)} — ${clean(t.artist)}` : clean(t.title)
      if ((head + prefix + [...items, item].join('; ')).length > MUSIC_MAX_CHARS) break
      items.push(item)
    }
    if (items.length) lines.push(prefix + items.join('; '))
  }
  return lines.join('\n').slice(0, MUSIC_MAX_CHARS)
}

export type MusicService = 'lastfm' | 'listenbrainz'
export const MUSIC_USERNAME_MAX = 100

/** URL fragment the Last.fm callback hands back: `#music=lastfm:<encoded username>`. */
export const musicFragment = (service: MusicService, username: string) => `#music=${service}:${encodeURIComponent(username)}`

/** Parses that fragment; null for anything else (wrong prefix/service, empty, undecodable or oversized name). */
export function parseMusicFragment(hash: string): { service: MusicService; username: string } | null {
  const m = /^#music=lastfm:([^:]*)$/.exec(hash)
  if (!m) return null
  let username: string
  try {
    username = decodeURIComponent(m[1]).trim()
  } catch {
    return null
  }
  return username && username.length <= MUSIC_USERNAME_MAX ? { service: 'lastfm', username } : null
}

export const youtubeEmbedUrl = (id: string, autoplay: boolean) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=${autoplay ? 1 : 0}`

export const youtubeMusicUrl = (id: string) => `https://music.youtube.com/watch?v=${encodeURIComponent(id)}`

export async function listenbrainzUserExists(name: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetchImpl(`${LB}/user/${encodeURIComponent(name)}/listen-count`, { cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

/** Recent listens plus this week's top artists. Throws on network/HTTP failure of the listens call. */
export async function listenbrainzListening(name: string, fetchImpl: typeof fetch = fetch): Promise<Listening> {
  const u = encodeURIComponent(name)
  const [listensRes, statsRes] = await Promise.all([
    fetchImpl(`${LB}/user/${u}/listens?count=10`, { cache: 'no-store' }),
    fetchImpl(`${LB}/stats/user/${u}/artists?range=this_week&count=5`, { cache: 'no-store' }).catch(() => null),
  ])
  if (!listensRes.ok) throw new Error('listenbrainz listens failed')
  const lj = (await listensRes.json().catch(() => null)) as { payload?: { listens?: { track_metadata?: { track_name?: unknown; artist_name?: unknown } }[] } } | null
  const recent: ListeningTrack[] = []
  for (const l of lj?.payload?.listens ?? []) {
    const title = l?.track_metadata?.track_name
    const artist = l?.track_metadata?.artist_name
    if (typeof title === 'string' && title) recent.push({ title, artist: typeof artist === 'string' ? artist : '' })
  }
  const topArtists: ListeningArtist[] = []
  if (statsRes && statsRes.ok && statsRes.status !== 204) {
    const sj = (await statsRes.json().catch(() => null)) as { payload?: { artists?: { artist_name?: unknown; listen_count?: unknown }[] } } | null
    for (const a of sj?.payload?.artists ?? []) {
      if (typeof a?.artist_name === 'string' && a.artist_name) topArtists.push({ name: a.artist_name, plays: Number(a.listen_count) || 0 })
    }
  }
  return { recent, topArtists }
}
