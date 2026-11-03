import { periodDates, periodRange, type Period } from './period'
import { isMoodTag, MOOD_SCORES } from './health-helpers'

// Pure helpers for the Notes / Goals / Reminders / Health views (no Firebase imports so they are unit-testable).

export type Debounced<A extends unknown[]> = ((...args: A) => void) & { flush: () => void; cancel: () => void }

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null
  const run = () => {
    timer = null
    if (!pending) return
    const args = pending
    pending = null
    fn(...args)
  }
  const d = ((...args: A) => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, ms)
  }) as Debounced<A>
  d.flush = () => {
    if (timer) clearTimeout(timer)
    run()
  }
  d.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }
  return d
}

export function splitReminders<T extends { dueMs: number; done: boolean }>(items: T[]): { upcoming: T[]; done: T[] } {
  const upcoming = items.filter((r) => !r.done).sort((a, b) => a.dueMs - b.dueMs)
  const done = items.filter((r) => r.done).sort((a, b) => b.dueMs - a.dueMs)
  return { upcoming, done }
}

export function filterNotes<T extends { title: string; body: string; tags: string[] }>(notes: T[], term: string): T[] {
  const q = term.trim().toLowerCase()
  if (!q) return notes
  return notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))
}

export function parseTags(raw: string): string[] {
  const out: string[] = []
  for (const t of raw.split(/[,\n]/)) {
    const tag = t.trim().replace(/^#/, '').slice(0, 40)
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out.slice(0, 20)
}

export function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type WeekPoint = { date: string; label: string; mood: number | null }

// Last 7 local days ending at `today` (YYYY-MM-DD), oldest first; missing days have mood null.
export function lastSevenDays(today: string, logs: { date: string; mood?: number }[]): WeekPoint[] {
  return chartDays(daysEndingOn(today, 7), logs)
}

const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// The `count` local date keys ending on `today` (YYYY-MM-DD), oldest first.
function daysEndingOn(today: string, count: number): string[] {
  const t = parseKey(today)
  const out: string[] = []
  for (let i = count - 1; i >= 0; i--) out.push(localDateKey(new Date(t.getFullYear(), t.getMonth(), t.getDate() - i)))
  return out
}

/** Chart points for the given date keys: weekday labels for up to 7 days, short dates ("Nov 3") beyond that. */
export function chartDays(keys: string[], logs: { date: string; mood?: number }[]): WeekPoint[] {
  const byDate = new Map(logs.map((l) => [l.date, l.mood]))
  const fmt: Intl.DateTimeFormatOptions = keys.length <= 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' }
  return keys.map((key) => {
    const mood = byDate.get(key)
    return { date: key, label: parseKey(key).toLocaleDateString('en-US', fmt), mood: typeof mood === 'number' ? mood : null }
  })
}

export const HEALTH_ALL_DAYS = 90

/** Date keys the Health charts cover: today = the last 7 days (unchanged), week/month = the calendar period, all = the last 90 days. */
export function healthPeriodDates(period: Period, now: Date = new Date()): string[] {
  if (period === 'today') return daysEndingOn(localDateKey(now), 7)
  if (period === 'all') return daysEndingOn(localDateKey(now), HEALTH_ALL_DAYS)
  return periodDates(period, now)
}

export type HealthPeriodStats = { avgMood: number | null; moodDays: number; avgSleepMinutes: number | null; sleepDays: number; totalCalories: number; avgDailyCalories: number | null; mealDays: number }

/** Averages over the days in `dates` that have data (mood falls back to the tag's score; calories over days with meals). */
export function healthPeriodStats(dates: string[], logs: { date: string; mood?: unknown; moodTag?: unknown; sleepMinutes?: unknown }[], meals: { date: string; totalCalories: number }[]): HealthPeriodStats {
  const inDates = new Set(dates)
  let moodSum = 0
  let moodDays = 0
  let sleepSum = 0
  let sleepDays = 0
  for (const l of logs) {
    if (!inDates.has(l.date)) continue
    const mood = typeof l.mood === 'number' && Number.isFinite(l.mood) ? l.mood : isMoodTag(l.moodTag) ? MOOD_SCORES[l.moodTag] : null
    if (mood != null) {
      moodSum += mood
      moodDays++
    }
    if (typeof l.sleepMinutes === 'number' && Number.isFinite(l.sleepMinutes)) {
      sleepSum += l.sleepMinutes
      sleepDays++
    }
  }
  const perDay = new Map<string, number>()
  for (const m of meals) if (inDates.has(m.date)) perDay.set(m.date, (perDay.get(m.date) ?? 0) + (m.totalCalories || 0))
  const totalCalories = [...perDay.values()].reduce((a, b) => a + b, 0)
  return {
    avgMood: moodDays ? Math.round((moodSum / moodDays) * 10) / 10 : null,
    moodDays,
    avgSleepMinutes: sleepDays ? Math.round(sleepSum / sleepDays) : null,
    sleepDays,
    totalCalories,
    avgDailyCalories: perDay.size ? Math.round(totalCalories / perDay.size) : null,
    mealDays: perDay.size,
  }
}

/** Meals grouped by date, newest day first; order within a day is kept. */
export function mealsByDay<T extends { date: string; totalCalories: number }>(meals: T[]): { date: string; total: number; meals: T[] }[] {
  const groups = new Map<string, T[]>()
  for (const m of meals) groups.set(m.date, [...(groups.get(m.date) ?? []), m])
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, ms]) => ({ date, total: ms.reduce((s, m) => s + (m.totalCalories || 0), 0), meals: ms }))
}

export function splitSleep(minutes: number | undefined): { hours: number; minutes: number } {
  const total = Math.max(0, Math.round(minutes ?? 0))
  return { hours: Math.floor(total / 60), minutes: total % 60 }
}

export function areaShares(goals: { category: string }[]): { category: string; count: number; pct: number }[] {
  const counts = new Map<string, number>()
  for (const g of goals) counts.set(g.category, (counts.get(g.category) ?? 0) + 1)
  return [...counts.entries()].map(([category, count]) => ({ category, count, pct: Math.round((count / goals.length) * 100) }))
}

// Sleep inputs are strings so they can be cleared. Returns minutes, or null when nothing should be saved yet:
// hours must be a valid whole number; empty minutes count as 0 only when hours is set.
export function parseSleepInput(hours: string, minutes: string): number | null {
  const h = hours.trim()
  const m = minutes.trim()
  if (h === '' || !/^\d+$/.test(h)) return null
  if (m !== '' && !/^\d+$/.test(m)) return null
  const hh = Number(h)
  const mm = m === '' ? 0 : Number(m)
  if (hh > 24 || mm > 59) return null
  return hh * 60 + mm
}

// Water stepper: never below 0 or above 30.
export function stepWater(current: number, delta: number): number {
  return Math.min(30, Math.max(0, current + delta))
}

export type Source = { title: string; url: string }

/** The normalized href of an http(s) URL; anything else (javascript:, data:, relative, junk) is null. */
export function safeSourceUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** At most 5 safe sources with trimmed titles (<= 200) and urls (<= 500); unsafe or over-long urls are dropped. */
export function sanitizeSources(sources: readonly Source[] | undefined): Source[] {
  const out: Source[] = []
  for (const s of sources ?? []) {
    const url = safeSourceUrl(s?.url)
    if (!url || url.length > 500) continue
    const title = (typeof s.title === 'string' ? s.title.trim() : '').slice(0, 200) || new URL(url).hostname
    out.push({ title, url })
    if (out.length === 5) break
  }
  return out
}

// Period selectors. `now` is a parameter so callers/tests control the clock; each computes the range once.
const inRange = (ms: number | null | undefined, range: { start: number; end: number }) => ms != null && ms >= range.start && ms < range.end

/** A note is in the period when it was created or updated in it. */
export function notesInPeriod<T extends { createdMs: number | null; updatedMs: number | null }>(notes: T[], period: Period, now: Date = new Date()): T[] {
  const range = periodRange(period, now)
  if (!range) return notes
  return notes.filter((n) => inRange(n.createdMs, range) || inRange(n.updatedMs, range))
}

/** A goal is in the period when created/updated in it, or its YYYY-MM-DD target date (local) falls in it. */
export function goalsInPeriod<T extends { createdMs: number | null; updatedMs: number | null; targetDate?: string }>(goals: T[], period: Period, now: Date = new Date()): T[] {
  const range = periodRange(period, now)
  if (!range) return goals
  return goals.filter((g) => {
    if (inRange(g.createdMs, range) || inRange(g.updatedMs, range)) return true
    const m = g.targetDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(g.targetDate) : null
    return m ? inRange(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime(), range) : false
  })
}

/** A reminder is in the period when due in it; overdue not-done reminders always stay visible (except 'all', which shows everything). */
export function remindersInPeriod<T extends { dueMs: number; done: boolean }>(reminders: T[], period: Period, now: Date = new Date()): T[] {
  const range = periodRange(period, now)
  if (!range) return reminders
  const nowMs = now.getTime()
  return reminders.filter((r) => inRange(r.dueMs, range) || (!r.done && r.dueMs < nowMs))
}
