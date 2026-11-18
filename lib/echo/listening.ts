// The built-in music pattern analyzer: Echo's own player records each song it actually plays (users/{uid}/listens),
// and these pure helpers turn that history into habits Echo uses when asked ("play my usual", "what do I listen to
// most?"). No Firebase imports.
import type { MusicTrack } from './music-play'
import { promptTitle } from './playlists'

export type ListenOutcome = 'playing' | 'finished' | 'skipped' | 'partial'
export type Listen = { videoId: string; title: string; channel?: string; startedMs: number; outcome: ListenOutcome; listenedSec?: number }

export const LISTEN_WINDOW_DAYS = 60
/** Under this many seconds a song that didn't finish counts as skipped. */
export const SKIP_UNDER_SEC = 30
const DAY_MS = 86_400_000
const ID_RE = /^[A-Za-z0-9_-]{11}$/
const OUTCOMES: readonly ListenOutcome[] = ['playing', 'finished', 'skipped', 'partial']

/** A stored listen doc (startedAt is a Firestore Timestamp), or null when it's unusable. */
export function toListen(data: unknown): Listen | null {
  const d = (data ?? {}) as { videoId?: unknown; title?: unknown; channel?: unknown; startedAt?: { toMillis?: () => number }; outcome?: unknown; listenedSec?: unknown }
  if (typeof d.videoId !== 'string' || !ID_RE.test(d.videoId) || typeof d.title !== 'string') return null
  const startedMs = typeof d.startedAt?.toMillis === 'function' ? d.startedAt.toMillis() : NaN
  if (!Number.isFinite(startedMs)) return null
  const outcome = OUTCOMES.includes(d.outcome as ListenOutcome) ? (d.outcome as ListenOutcome) : 'playing'
  return {
    videoId: d.videoId,
    title: d.title.slice(0, 200),
    ...(typeof d.channel === 'string' && d.channel ? { channel: d.channel.slice(0, 200) } : {}),
    startedMs,
    outcome,
    ...(typeof d.listenedSec === 'number' && Number.isFinite(d.listenedSec) ? { listenedSec: d.listenedSec } : {}),
  }
}

/** How a song that is leaving the player went. */
export function listenOutcome(ended: boolean, listenedSec: number): Exclude<ListenOutcome, 'playing'> {
  return ended ? 'finished' : listenedSec < SKIP_UNDER_SEC ? 'skipped' : 'partial'
}

/** The artist behind a YouTube channel name ("SurvivorVEVO" -> "Survivor", "X - Topic" -> "X"). */
export function artistOf(channel: string | undefined): string {
  return (channel ?? '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/, '').trim()
}

type SongStat = { videoId: string; title: string; artist: string; plays: number }
type Habit = { when: string; videoId: string; title: string; artist: string; plays: number }
export type ListeningAnalysis = {
  plays: number
  topSongs: SongStat[]
  topArtists: { name: string; plays: number }[]
  habits: Habit[]
  oftenSkipped: SongStat[]
  newThisWeek: SongStat[]
}

function partOfDay(h: number): string {
  return h >= 5 && h < 12 ? 'mornings' : h >= 12 && h < 17 ? 'afternoons' : h >= 17 && h < 22 ? 'evenings' : 'nights'
}

/** Patterns in the last 60 days of plays (local time). Skips don't count toward favourites or habits. */
export function analyzeListening(listens: Listen[], now: Date): ListeningAnalysis {
  const since = now.getTime() - LISTEN_WINDOW_DAYS * DAY_MS
  const recent = listens.filter((l) => l.startedMs >= since && l.startedMs <= now.getTime() + DAY_MS)
  const songs = new Map<string, { stat: SongStat; skips: number; total: number; first: number }>()
  for (const l of recent) {
    const s = songs.get(l.videoId) ?? { stat: { videoId: l.videoId, title: l.title, artist: artistOf(l.channel), plays: 0 }, skips: 0, total: 0, first: l.startedMs }
    s.total++
    if (l.outcome === 'skipped') s.skips++
    else s.stat.plays++
    s.first = Math.min(s.first, l.startedMs)
    songs.set(l.videoId, s)
  }
  const all = [...songs.values()]
  const isOftenSkipped = (s: { skips: number; total: number }) => s.total >= 3 && s.skips / s.total >= 0.6
  const byPlays = (a: SongStat, b: SongStat) => b.plays - a.plays || a.title.localeCompare(b.title)
  const liked = all.filter((s) => !isOftenSkipped(s) && s.stat.plays > 0).map((s) => s.stat)

  const artists = new Map<string, number>()
  for (const s of liked) if (s.artist) artists.set(s.artist, (artists.get(s.artist) ?? 0) + s.plays)
  const topArtists = [...artists.entries()].map(([name, plays]) => ({ name, plays })).sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name))

  // Habits: in each weekday/weekend × part-of-day slot, the song that makes up a real share of plays.
  const slots = new Map<string, Map<string, number>>()
  for (const l of recent) {
    if (l.outcome === 'skipped' || isOftenSkipped(songs.get(l.videoId)!)) continue
    const d = new Date(l.startedMs)
    const when = `${d.getDay() === 0 || d.getDay() === 6 ? 'weekend' : 'weekday'} ${partOfDay(d.getHours())}`
    const slot = slots.get(when) ?? new Map<string, number>()
    slot.set(l.videoId, (slot.get(l.videoId) ?? 0) + 1)
    slots.set(when, slot)
  }
  const habits: Habit[] = []
  for (const [when, counts] of slots) {
    const total = [...counts.values()].reduce((a, b) => a + b, 0)
    const [videoId, plays] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (plays >= 3 && plays / total >= 0.4) {
      const s = songs.get(videoId)!.stat
      habits.push({ when, videoId, title: s.title, artist: s.artist, plays })
    }
  }
  habits.sort((a, b) => b.plays - a.plays)

  const weekAgo = now.getTime() - 7 * DAY_MS
  return {
    plays: recent.length,
    topSongs: [...liked].sort(byPlays).slice(0, 10),
    topArtists: topArtists.slice(0, 10),
    habits,
    oftenSkipped: all.filter(isOftenSkipped).map((s) => s.stat).sort((a, b) => a.title.localeCompare(b.title)).slice(0, 5),
    newThisWeek: all.filter((s) => s.first >= weekAgo && s.stat.plays >= 2 && !isOftenSkipped(s)).map((s) => s.stat).sort(byPlays).slice(0, 5),
  }
}

const HABITS_MAX = 900
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** A few lines for Echo's MUSIC block ('' without plays). Titles are cleaned and defanged. */
export function renderListeningHabits(a: ListeningAnalysis): string {
  if (!a.plays) return ''
  const song = (s: { title: string; artist: string }, n?: number) => `${promptTitle(s.title)}${s.artist || n !== undefined ? ` (${[promptTitle(s.artist), n].filter((x) => x !== '' && x !== undefined).join(', ')})` : ''}`
  const lines = [`Listening habits (last ${LISTEN_WINDOW_DAYS} days, ${a.plays} plays):`]
  if (a.topSongs.length) lines.push(`- Most played: ${a.topSongs.slice(0, 5).map((s) => song(s, s.plays)).join('; ')}`)
  if (a.topArtists.length) lines.push(`- Top artists: ${a.topArtists.slice(0, 5).map((x) => `${promptTitle(x.name)} (${x.plays})`).join(', ')}`)
  for (const h of a.habits.slice(0, 4)) lines.push(`- ${cap(h.when)}: ${song(h)}`)
  if (a.oftenSkipped.length) lines.push(`- Usually skipped: ${a.oftenSkipped.map((s) => promptTitle(s.title)).join('; ')}`)
  if (a.newThisWeek.length) lines.push(`- New this week: ${a.newThisWeek.map((s) => promptTitle(s.title)).join('; ')}`)
  let text = lines.join('\n')
  while (text.length > HABITS_MAX && lines.length > 2) {
    lines.pop()
    text = lines.join('\n')
  }
  return text.slice(0, HABITS_MAX)
}

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)

/** A song from the history whose title has every word of the query (most played first), to replay without a search. */
export function matchHistory(query: string, listens: Listen[]): MusicTrack | null {
  const q = words(query)
  if (!q.length || q.join(' ').length < 3) return null
  const counts = new Map<string, { track: MusicTrack; plays: number }>()
  for (const l of listens) {
    if (l.outcome === 'skipped') continue
    const t = new Set(words(l.title))
    if (!q.every((w) => t.has(w))) continue
    const c = counts.get(l.videoId) ?? { track: { videoId: l.videoId, title: l.title, ...(l.channel ? { channel: l.channel } : {}) }, plays: 0 }
    c.plays++
    counts.set(l.videoId, c)
  }
  return [...counts.values()].sort((a, b) => b.plays - a.plays)[0]?.track ?? null
}

/** True for the YouTube embed's postMessage saying the video is playing (state 1). */
export function isPlayingMessage(data: unknown): boolean {
  if (typeof data !== 'string') return false
  try {
    const m = JSON.parse(data) as { event?: unknown; info?: unknown }
    if (m?.event === 'onStateChange') return m.info === 1
    if (m?.event === 'infoDelivery' && m.info && typeof m.info === 'object') return (m.info as { playerState?: unknown }).playerState === 1
  } catch {
    // not ours
  }
  return false
}
