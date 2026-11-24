/** Day grouping for the Notes list and the Reminders sections, in the user's own time zone. */

const keyFormats = new Map<string, Intl.DateTimeFormat>()

/** Local calendar day of `ms` in `timeZone` as YYYY-MM-DD. */
export function dayKey(ms: number, timeZone: string): string {
  let f = keyFormats.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    keyFormats.set(timeZone, f)
  }
  return f.format(ms)
}

const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000)
}

/** Whole local days from `ms` to `nowMs` (0 = same day, 1 = yesterday, -1 = tomorrow). */
export function daysAgo(ms: number, nowMs: number, timeZone: string): number {
  return dayNumber(dayKey(nowMs, timeZone)) - dayNumber(dayKey(ms, timeZone))
}

function dayLabel(ms: number, nowMs: number, timeZone: string): string {
  const ago = daysAgo(ms, nowMs, timeZone)
  if (ago === 0) return 'Today'
  if (ago === 1) return 'Yesterday'
  const sameYear = dayKey(ms, timeZone).slice(0, 4) === dayKey(nowMs, timeZone).slice(0, 4)
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(ms)
}

/** Groups items by local day: newest day first, newest item first inside each day. */
export function groupByDay<T>(items: T[], getMs: (t: T) => number, nowMs: number, timeZone: string): { label: string; items: T[] }[] {
  const sorted = [...items].sort((a, b) => getMs(b) - getMs(a))
  const out: { key: string; label: string; items: T[] }[] = []
  for (const it of sorted) {
    const ms = getMs(it)
    const key = dayKey(ms, timeZone)
    const last = out[out.length - 1]
    if (last && last.key === key) last.items.push(it)
    else out.push({ key, label: dayLabel(ms, nowMs, timeZone), items: [it] })
  }
  return out.map(({ label, items: list }) => ({ label, items: list }))
}

export type ReminderSectionKey = 'today' | 'tomorrow' | 'later' | 'done'
const SECTION_LABEL: Record<ReminderSectionKey, string> = { today: 'Today', tomorrow: 'Tomorrow', later: 'Later', done: 'Done' }

/**
 * Reminders as one list: Today (overdue included, oldest first), Tomorrow, Later, then Done (newest first).
 * Empty sections are left out.
 */
export function reminderSections<T extends { dueMs: number; done: boolean }>(reminders: T[], nowMs: number, timeZone: string): { key: ReminderSectionKey; label: string; items: T[] }[] {
  const buckets: Record<ReminderSectionKey, T[]> = { today: [], tomorrow: [], later: [], done: [] }
  for (const r of reminders) {
    if (r.done) {
      buckets.done.push(r)
      continue
    }
    const ago = daysAgo(r.dueMs, nowMs, timeZone)
    if (ago >= 0) buckets.today.push(r)
    else if (ago === -1) buckets.tomorrow.push(r)
    else buckets.later.push(r)
  }
  const asc = (a: T, b: T) => a.dueMs - b.dueMs
  buckets.today.sort(asc)
  buckets.tomorrow.sort(asc)
  buckets.later.sort(asc)
  buckets.done.sort((a, b) => b.dueMs - a.dueMs)
  return (['today', 'tomorrow', 'later', 'done'] as const).filter((k) => buckets[k].length > 0).map((k) => ({ key: k, label: SECTION_LABEL[k], items: buckets[k] }))
}

export const SNOOZE_MS = 30 * 60_000

/** New due time for "snooze 30 min": 30 minutes after now, or after the due time when that is still ahead. */
export function snoozeUntil(dueMs: number, nowMs: number): number {
  return Math.max(dueMs, nowMs) + SNOOZE_MS
}

/** The browser's time zone, falling back to UTC. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}
