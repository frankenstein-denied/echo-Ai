// Short live lines and small decisions for the 2nd Brain, Music and Settings pages. Pure: no Firebase, no DOM.
import type { CheckInSettings } from './check-ins'
import type { ListeningAnalysis } from './listening'
import { parseYoutubeLinks } from './playlists'

/** The most check-ins a day (the Android pacing caps them here). */
export const CHECK_INS_PER_DAY = 5

/** "22:00" → "10 PM", "06:15" → "6:15 AM". Anything else comes back as it was. */
export function clock12(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return hhmm
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return hhmm
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}${min ? `:${m[2]}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}

/** Settings' check-ins row: "Up to 5 a day · quiet 10 PM–7 AM", or "Off". */
export function checkInSummary(s: Pick<CheckInSettings, 'enabled' | 'sleepStart' | 'sleepEnd'>): string {
  if (!s.enabled) return 'Off'
  return `Up to ${CHECK_INS_PER_DAY} a day · quiet ${clock12(s.sleepStart)}–${clock12(s.sleepEnd)}`
}

type Part = 'mornings' | 'afternoons' | 'evenings' | 'nights'
// Same buckets as the listening analyzer's habits.
function partOfDay(h: number): Part {
  return h >= 5 && h < 12 ? 'mornings' : h >= 12 && h < 17 ? 'afternoons' : h >= 17 && h < 22 ? 'evenings' : 'nights'
}

/** "Morning", "Afternoon", "Evening" or "Night". */
export function partOfDayLabel(now: Date): string {
  const p = partOfDay(now.getHours())
  return p.charAt(0).toUpperCase() + p.slice(1, -1)
}

export type UsualNow = { videoId: string; title: string; artist: string; detail: string }

/**
 * "Your usual now": the habit for this exact slot (weekday/weekend × part of day), else a habit at this part of the
 * day, else the most played song. Null without plays.
 */
export function usualNow(a: ListeningAnalysis, now: Date): UsualNow | null {
  const part = partOfDay(now.getHours())
  const day = now.getDay() === 0 || now.getDay() === 6 ? 'weekend' : 'weekday'
  const habit = a.habits.find((h) => h.when === `${day} ${part}`) ?? a.habits.find((h) => h.when.endsWith(` ${part}`))
  if (habit) return { videoId: habit.videoId, title: habit.title, artist: habit.artist, detail: `played ${habit.plays} ${habit.plays === 1 ? part.slice(0, -1) : part}` }
  const top = a.topSongs[0]
  if (!top) return null
  return { videoId: top.videoId, title: top.title, artist: top.artist, detail: `played ${top.plays} ${top.plays === 1 ? 'time' : 'times'} lately` }
}

/** Music's header line: "Evening · you usually play Lo-fi evening mix". */
export function musicLine(now: Date, usual: { title: string } | null): string {
  const part = partOfDayLabel(now)
  return usual ? `${part} · you usually play ${usual.title}` : `${part} · play something or paste a link`
}

export type MusicBoxIntent = { kind: 'links'; ids: string[] } | { kind: 'usual' } | { kind: 'play'; query: string } | { kind: 'echo' }

const PLAY_VERB = /^(?:please\s+)?(?:play|put on|listen to|queue up|queue)\b[\s,:]*/i
const USUAL = /^(?:(?:my|the)\s+)?(?:usual|something|anything|some music|music)(?:\s+(?:now|please))?[.!]*$/i
// Words that mean the sentence is for Echo (a question, a save, a reminder…), not a song name.
const FOR_ECHO =
  /\?|^(?:what|how|why|when|who|which|where|do|does|did|is|are|can|could|should|tell|show|add|save|remind|note|log|track|set|make|create|delete|remove|i|i'm|im|my day)\b|\b(?:remind|reminder|note|goal|ate|drank|slept|water|calories|mood|feel|felt)\b/i

/**
 * What the Music page's box should do with a sentence: play pasted links, play the usual, search a song or
 * playlist, or (questions, saves, anything long) hand it to Echo.
 */
export function musicBoxIntent(text: string): MusicBoxIntent {
  const t = text.trim()
  if (!t) return { kind: 'echo' }
  const ids = parseYoutubeLinks(t)
  if (ids.length) return { kind: 'links', ids }
  const verb = PLAY_VERB.exec(t)
  const rest = verb ? t.slice(verb[0].length).trim() : t
  if (USUAL.test(rest) || (verb && !rest)) return { kind: 'usual' }
  if (verb) return { kind: 'play', query: rest.replace(/[.!]+$/, '') }
  if (FOR_ECHO.test(t) || t.split(/\s+/).length > 8) return { kind: 'echo' }
  return { kind: 'play', query: t.replace(/[.!]+$/, '') }
}

/** 2nd Brain's header line from the number of diary pages (memory orbs) this week. */
export function brainLine(weekCount: number): string {
  if (weekCount <= 0) return 'No new memories this week'
  return `${weekCount} ${weekCount === 1 ? 'memory' : 'memories'} this week`
}
