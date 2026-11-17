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

/** `key` changes whenever the embed must (re)load: a new current track, or reopening it paused. */
export type QueueState = { tracks: MusicTrack[]; index: number; autoplay: boolean; key: number }
export type QueueAction =
  | { type: 'play'; tracks: MusicTrack[]; start: number; autoplay: boolean }
  | { type: 'enqueue'; tracks: MusicTrack[] }
  | { type: 'next' }
  | { type: 'prev' }
  | { type: 'jump'; index: number }
  | { type: 'remove'; index: number }
  | { type: 'pause' }
  | { type: 'close' }

const MAX_QUEUE = 200

export function queueReducer(s: QueueState, a: QueueAction): QueueState {
  switch (a.type) {
    case 'play': {
      const tracks = a.tracks.slice(0, MAX_QUEUE)
      if (!tracks.length) return s
      return { tracks, index: Math.min(Math.max(0, a.start), tracks.length - 1), autoplay: a.autoplay, key: s.key + 1 }
    }
    case 'enqueue': {
      if (!a.tracks.length) return s
      if (!s.tracks.length) return { tracks: a.tracks.slice(0, MAX_QUEUE), index: 0, autoplay: true, key: s.key + 1 }
      return { ...s, tracks: [...s.tracks, ...a.tracks].slice(0, MAX_QUEUE) }
    }
    case 'next':
      return s.index + 1 < s.tracks.length ? { ...s, index: s.index + 1, autoplay: true, key: s.key + 1 } : s
    case 'prev':
      return s.index > 0 ? { ...s, index: s.index - 1, autoplay: true, key: s.key + 1 } : s
    case 'jump':
      return a.index >= 0 && a.index < s.tracks.length ? { ...s, index: a.index, autoplay: true, key: s.key + 1 } : s
    case 'remove': {
      if (a.index < 0 || a.index >= s.tracks.length) return s
      const tracks = s.tracks.filter((_, i) => i !== a.index)
      if (!tracks.length) return { ...s, tracks: [], index: 0, key: s.key + 1 }
      if (a.index < s.index) return { ...s, tracks, index: s.index - 1 }
      if (a.index > s.index) return { ...s, tracks }
      // Removing the current track plays the one that took its place.
      return { ...s, tracks, index: Math.min(s.index, tracks.length - 1), key: s.key + 1 }
    }
    case 'pause':
      return s.tracks.length ? { ...s, autoplay: false, key: s.key + 1 } : s
    case 'close':
      return { tracks: [], index: 0, autoplay: false, key: s.key + 1 }
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
