// Browser-safe helpers for the Music page: link playlists (saved per user in Firestore), the player's queue and the
// YouTube embed's "ended" message. No Firebase imports.
import { parseYoutubeLink } from './music'
import type { MusicTrack } from './music-play'

export const PLAYLIST_LIMITS = { name: 60, tracks: 100, playlists: 50, title: 200 } as const
const ID_RE = /^[A-Za-z0-9_-]{11}$/
const UNTITLED = 'YouTube video'

export type Playlist = { id: string; name: string; tracks: MusicTrack[] }

/** Every YouTube / YouTube Music video in pasted text (one link per line or separated by spaces), in order, once each. */
export function parseYoutubeLinks(text: string): string[] {
  const ids: string[] = []
  for (const token of text.slice(0, 20000).split(/\s+/)) {
    const id = token ? parseYoutubeLink(token) : null
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

export function cleanPlaylistName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, PLAYLIST_LIMITS.name)
}

/** `current` plus the new tracks that aren't in it yet, up to the playlist limit. */
export function addTracks(current: MusicTrack[], more: MusicTrack[]): MusicTrack[] {
  const out = [...current]
  for (const t of more) {
    if (out.length >= PLAYLIST_LIMITS.tracks) break
    if (!out.some((x) => x.videoId === t.videoId)) out.push(t)
  }
  return out
}

function toTrack(raw: unknown): MusicTrack | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as { videoId?: unknown; title?: unknown; channel?: unknown }
  if (typeof r.videoId !== 'string' || !ID_RE.test(r.videoId)) return null
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, PLAYLIST_LIMITS.title) : UNTITLED
  const channel = typeof r.channel === 'string' && r.channel.trim() ? r.channel.trim().slice(0, PLAYLIST_LIMITS.title) : undefined
  return { videoId: r.videoId, title, ...(channel ? { channel } : {}) }
}

/** A stored playlist doc, or null when it has no name. Bad tracks are dropped. */
export function toPlaylist(id: string, data: unknown): Playlist | null {
  const d = (data ?? {}) as { name?: unknown; tracks?: unknown }
  const name = typeof d.name === 'string' ? cleanPlaylistName(d.name) : ''
  if (!name) return null
  const tracks = Array.isArray(d.tracks) ? d.tracks.map(toTrack).filter((t): t is MusicTrack => t !== null).slice(0, PLAYLIST_LIMITS.tracks) : []
  return { id, name, tracks }
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(my|the|playlist|play ?list)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** The playlist a play request names ("gym", "my gym playlist"), or null. Only exact name matches; never an empty list. */
export function matchPlaylist(query: string, playlists: Playlist[]): Playlist | null {
  const q = norm(query)
  if (!q) return null
  return playlists.find((p) => p.tracks.length > 0 && norm(p.name) === q) ?? null
}

/** Fisher-Yates shuffle (copy). */
export function shuffled<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------- the player's queue ----------

/**
 * `key` changes whenever the embed must (re)load: a new current track, or reopening it paused. `cause` says why the
 * current track started: 'ended' when the previous song finished (the player stays minimized), else 'user'.
 */
export type QueueState = { tracks: MusicTrack[]; index: number; autoplay: boolean; key: number; cause: 'user' | 'ended' }
export type QueueAction =
  | { type: 'play'; tracks: MusicTrack[]; start: number; autoplay: boolean }
  | { type: 'enqueue'; tracks: MusicTrack[] }
  /** autoplay false opens the song paused (in a call, never over Echo's voice). */
  | { type: 'next'; autoplay?: boolean }
  /** The embed with this key reported the song ended. Stale keys are ignored (YouTube can report one end twice). */
  | { type: 'ended'; key: number }
  | { type: 'prev'; autoplay?: boolean }
  | { type: 'jump'; index: number; autoplay?: boolean }
  | { type: 'remove'; index: number }
  | { type: 'pause' }
  /** Shuffle the songs after the current one (the current song keeps playing). */
  | { type: 'shuffleRest'; rand?: () => number }
  | { type: 'close' }

const MAX_QUEUE = 200

export function queueReducer(s: QueueState, a: QueueAction): QueueState {
  switch (a.type) {
    case 'play': {
      const tracks = a.tracks.slice(0, MAX_QUEUE)
      if (!tracks.length) return s
      return { tracks, index: Math.min(Math.max(0, a.start), tracks.length - 1), autoplay: a.autoplay, key: s.key + 1, cause: 'user' }
    }
    case 'enqueue': {
      if (!a.tracks.length) return s
      if (!s.tracks.length) return { tracks: a.tracks.slice(0, MAX_QUEUE), index: 0, autoplay: true, key: s.key + 1, cause: 'user' }
      return { ...s, tracks: [...s.tracks, ...a.tracks].slice(0, MAX_QUEUE) }
    }
    case 'next':
      return s.index + 1 < s.tracks.length ? { ...s, index: s.index + 1, autoplay: a.autoplay ?? true, key: s.key + 1, cause: 'user' } : s
    case 'ended':
      return a.key === s.key && s.index + 1 < s.tracks.length ? { ...s, index: s.index + 1, autoplay: true, key: s.key + 1, cause: 'ended' } : s
    case 'prev':
      return s.index > 0 ? { ...s, index: s.index - 1, autoplay: a.autoplay ?? true, key: s.key + 1, cause: 'user' } : s
    case 'jump':
      return a.index >= 0 && a.index < s.tracks.length ? { ...s, index: a.index, autoplay: a.autoplay ?? true, key: s.key + 1, cause: 'user' } : s
    case 'remove': {
      if (a.index < 0 || a.index >= s.tracks.length) return s
      const tracks = s.tracks.filter((_, i) => i !== a.index)
      if (!tracks.length) return { ...s, tracks: [], index: 0, key: s.key + 1 }
      if (a.index < s.index) return { ...s, tracks, index: s.index - 1 }
      if (a.index > s.index) return { ...s, tracks }
      // Removing the current track plays the one that took its place.
      return { ...s, tracks, index: Math.min(s.index, tracks.length - 1), key: s.key + 1, cause: 'user' }
    }
    case 'pause':
      return s.tracks.length ? { ...s, autoplay: false, key: s.key + 1, cause: 'user' } : s
    case 'shuffleRest':
      return s.index + 2 < s.tracks.length ? { ...s, tracks: [...s.tracks.slice(0, s.index + 1), ...shuffled(s.tracks.slice(s.index + 1), a.rand)] } : s
    case 'close':
      return { tracks: [], index: 0, autoplay: false, key: s.key + 1, cause: 'user' }
  }
}

/** True for the YouTube embed's postMessage saying the video ended (state 0). Only JSON strings count. */
export function isEndedMessage(data: unknown): boolean {
  if (typeof data !== 'string') return false
  try {
    const m = JSON.parse(data) as { event?: unknown; info?: unknown }
    if (m?.event === 'onStateChange') return m.info === 0
    if (m?.event === 'infoDelivery' && m.info && typeof m.info === 'object') return (m.info as { playerState?: unknown }).playerState === 0
  } catch {
    // not ours
  }
  return false
}

// ---------- what Echo is told about music ----------

export const MUSIC_CONTEXT_MAX = 3000
const TITLES_PER_PLAYLIST = 15
const TITLE_MAX = 70

/** A title or name made safe for a delimited prompt block: one line, no "===", no YouTube video-type suffixes. */
function promptTitle(s: string): string {
  return s
    .replace(/[\r\n]+/g, ' ')
    .replace(/={2,}/g, '=')
    .replace(/\s*[([](official\s+)?(music\s+)?(video|audio|lyric(s)?(\s+video)?|visuali[sz]er|hd|4k|remaster(ed)?)[)\]]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TITLE_MAX)
}

/**
 * The MUSIC block for Echo's context: what's playing, what's next, every playlist's name and size, then as many song
 * titles as fit (shared fairly across playlists), so Echo can answer "what's in my gym playlist?" and control the
 * player. `playlists` is null while they load (the line is left out). `player` is false where nothing can play.
 */
export function renderMusicContext({ playlists, queue, player }: { playlists: Playlist[] | null; queue: { tracks: MusicTrack[]; index: number }; player: boolean }): string {
  const lines: string[] = []
  const current = queue.tracks[queue.index]
  if (!player) lines.push('There is no music player here (the floating bubble); open Echo to play music.')
  else if (!current) lines.push('Nothing is playing.')
  else {
    lines.push(`Now playing: ${promptTitle(current.title)} (song ${queue.index + 1} of ${queue.tracks.length} in the queue).`)
    const next = queue.tracks.slice(queue.index + 1, queue.index + 4).map((x) => promptTitle(x.title))
    if (next.length) lines.push(`Up next: ${next.join('; ')}${queue.tracks.length - queue.index - 1 > next.length ? '; …' : ''}.`)
  }
  if (playlists && !playlists.length) lines.push('No playlists yet.')
  if (playlists?.length) {
    const sorted = [...playlists].sort((a, b) => a.name.localeCompare(b.name))
    const count = (n: number) => `${n} ${n === 1 ? 'song' : 'songs'}`
    lines.push(`Playlists (${sorted.length}): ${sorted.map((p) => `${promptTitle(p.name)} (${count(p.tracks.length)})`).join(', ')}.`)
    // Room left for titles, shared evenly; a playlist that needs less gives the rest to the others.
    let room = MUSIC_CONTEXT_MAX - lines.join('\n').length - 1
    const withSongs = sorted.filter((p) => p.tracks.length)
    withSongs.forEach((p, i) => {
      const share = Math.floor(room / (withSongs.length - i))
      const head = `- ${promptTitle(p.name)} (${count(p.tracks.length)}): `
      const titles: string[] = []
      for (const t of p.tracks.slice(0, TITLES_PER_PLAYLIST)) {
        const next = promptTitle(t.title)
        const left = p.tracks.length - titles.length - 1
        const tail = left > 0 ? `; …and ${left} more` : ''
        if (head.length + [...titles, next].join('; ').length + tail.length + 1 > share) break
        titles.push(next)
      }
      const more = p.tracks.length - titles.length
      const line = `${head}${titles.join('; ') || '…'}${titles.length && more ? `; …and ${more} more` : ''}`
      if (line.length + 1 <= room) {
        lines.push(line)
        room -= line.length + 1
      }
    })
  }
  return lines.join('\n').slice(0, MUSIC_CONTEXT_MAX)
}
