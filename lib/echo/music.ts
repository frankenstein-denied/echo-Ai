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

export const MUSIC_USERNAME_MAX = 100

/** With `origin` (the page's), the embed accepts postMessage listeners and reports its state, e.g. when a song ends. */
export const youtubeEmbedUrl = (id: string, autoplay: boolean, origin?: string) =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=${autoplay ? 1 : 0}${origin ? `&enablejsapi=1&origin=${encodeURIComponent(origin)}` : ''}`

export const youtubeMusicUrl = (id: string) => `https://music.youtube.com/watch?v=${encodeURIComponent(id)}`

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/
const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'])
const SCHEMELESS_RE = /^(?:(?:www\.|m\.|music\.)?youtube\.com|youtu\.be)\//i

/** The 11-character video ID of the first YouTube / YouTube Music link in `text` (watch, youtu.be, shorts, embed), or null. */
export function parseYoutubeLink(text: string): string | null {
  if (typeof text !== 'string') return null
  for (const raw of text.slice(0, 4000).split(/\s+/)) {
    // Strip wrapping punctuation from a pasted or quoted link: (<"link">), "link." etc.
    const token = raw.replace(/^[<(["'“‘]+/, '').replace(/[>)\]"'”’.,!?;:]+$/, '')
    if (!token) continue
    const candidate = /^https?:\/\//i.test(token) ? token : SCHEMELESS_RE.test(token) ? `https://${token}` : null
    if (!candidate) continue
    let url: URL
    try {
      url = new URL(candidate)
    } catch {
      continue
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) continue
    const host = url.hostname.toLowerCase()
    const parts = url.pathname.split('/').filter(Boolean)
    let id: string | null = null
    if (host === 'youtu.be') id = parts.length === 1 ? parts[0] : null
    else if (YT_HOSTS.has(host)) {
      if (parts.length === 1 && parts[0] === 'watch') id = url.searchParams.get('v')
      else if (parts.length === 2 && (parts[0] === 'shorts' || parts[0] === 'embed')) id = parts[1]
    }
    if (id && YT_ID_RE.test(id)) return id
  }
  return null
}

/** true when the user exists, false on 404. Throws when the check itself fails (network error, abort, other non-OK). */
export async function listenbrainzUserExists(name: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const res = await fetchImpl(`${LB}/user/${encodeURIComponent(name)}/listen-count`, { cache: 'no-store' })
  if (res.status === 404) return false
  if (!res.ok) throw new Error('listenbrainz check failed')
  return true
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

/**
 * Title and channel of a YouTube video from YouTube's oEmbed endpoint (no API key; it allows browser requests).
 * Falls back to a plain "YouTube video" title. Never throws.
 */
export async function fetchVideoInfo(videoId: string, fetchImpl: typeof fetch = fetch): Promise<{ videoId: string; title: string; channel?: string }> {
  const plain = { videoId, title: 'YouTube video' }
  try {
    const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return plain
    const d = (await res.json()) as { title?: unknown; author_name?: unknown }
    const title = typeof d.title === 'string' ? d.title.replace(/\s+/g, ' ').trim().slice(0, 200) : ''
    const channel = typeof d.author_name === 'string' ? d.author_name.trim().slice(0, 200) : ''
    return title ? { videoId, title, ...(channel ? { channel } : {}) } : plain
  } catch {
    return plain
  }
}
