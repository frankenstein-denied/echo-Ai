import { localDateKey } from './view-helpers'

export type Period = 'today' | 'week' | 'month' | 'year' | 'all'

export const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'all', label: 'All' },
]

export const DEFAULT_PERIOD: Period = 'today'

// Local calendar range as epoch ms: start inclusive, end exclusive. null for 'all'.
export function periodRange(period: Period, now: Date = new Date()): { start: number; end: number } | null {
  const y = now.getFullYear()
  const m = now.getMonth()
  const day = now.getDate()
  switch (period) {
    case 'today':
      return { start: new Date(y, m, day).getTime(), end: new Date(y, m, day + 1).getTime() }
    case 'week': {
      const sinceMonday = (now.getDay() + 6) % 7
      return { start: new Date(y, m, day - sinceMonday).getTime(), end: new Date(y, m, day - sinceMonday + 7).getTime() }
    }
    case 'month':
      return { start: new Date(y, m, 1).getTime(), end: new Date(y, m + 1, 1).getTime() }
    case 'year':
      return { start: new Date(y, 0, 1).getTime(), end: new Date(y + 1, 0, 1).getTime() }
    case 'all':
      return null
  }
}

/** Whole percent (0-100) of the period that has passed by `now`. 'all' has no end, so it uses the year. */
export function periodElapsed(period: Period, now: Date = new Date()): number {
  const range = periodRange(period === 'all' ? 'year' : period, now)!
  const pct = ((now.getTime() - range.start) / (range.end - range.start)) * 100
  return Math.round(Math.min(100, Math.max(0, pct)))
}

export function inPeriod(ms: number | null | undefined, period: Period, now?: Date): boolean {
  const range = periodRange(period, now)
  if (!range) return true
  if (ms == null) return false
  return ms >= range.start && ms < range.end
}

// Every local YYYY-MM-DD key in the period, in order.
export function periodDates(period: Exclude<Period, 'all'>, now?: Date): string[] {
  const range = periodRange(period, now)!
  const first = new Date(range.start)
  const keys: string[] = []
  for (let i = 0; ; i++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i)
    if (day.getTime() >= range.end) break
    keys.push(localDateKey(day))
  }
  return keys
}

export function emptyPeriodText(period: Period): string {
  switch (period) {
    case 'today': return 'Nothing for today.'
    case 'week': return 'Nothing this week.'
    case 'month': return 'Nothing this month.'
    case 'year': return 'Nothing this year.'
    case 'all': return 'Nothing yet.'
  }
}
