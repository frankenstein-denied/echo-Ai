export type Timeline<T> = {
  overdue: T[]
  doneToday: T[]
  upcoming: T[]
  tomorrow: T[]
  thisWeek: T[]
  later: T[]
  doneEarlier: T[]
}

/** Groups reminders into local-day buckets, each sorted by dueMs ascending. */
export function reminderTimeline<T extends { dueMs: number; done: boolean }>(items: T[], now: Date): Timeline<T> {
  const y = now.getFullYear()
  const m = now.getMonth()
  const d = now.getDate()
  const today = new Date(y, m, d).getTime()
  const tomorrow = new Date(y, m, d + 1).getTime()
  const day2 = new Date(y, m, d + 2).getTime()
  const day7 = new Date(y, m, d + 7).getTime()
  const nowMs = now.getTime()

  const out: Timeline<T> = { overdue: [], doneToday: [], upcoming: [], tomorrow: [], thisWeek: [], later: [], doneEarlier: [] }
  for (const it of [...items].sort((a, b) => a.dueMs - b.dueMs)) {
    if (it.done) {
      if (it.dueMs >= today && it.dueMs < tomorrow) out.doneToday.push(it)
      else out.doneEarlier.push(it)
    } else if (it.dueMs < nowMs) out.overdue.push(it)
    else if (it.dueMs < tomorrow) out.upcoming.push(it)
    else if (it.dueMs < day2) out.tomorrow.push(it)
    else if (it.dueMs < day7) out.thisWeek.push(it)
    else out.later.push(it)
  }
  return out
}

const DAILY = new Set(['daily', 'every day', 'everyday', 'each day', 'nightly', 'every night', 'every morning'])

const DAY_TOKENS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
}

/** Whether a free-text cadence ("Mon/Wed/Fri", "weekdays", "daily") applies on `day`. */
export function cadenceMatches(cadence: string, day: Date): boolean {
  const text = cadence.trim().toLowerCase()
  const dow = day.getDay()
  if (DAILY.has(text)) return true
  if (text === 'weekdays') return dow >= 1 && dow <= 5
  if (text === 'weekends') return dow === 0 || dow === 6
  return text
    .split(/[^a-z]+/)
    .some((tok) => tok in DAY_TOKENS && DAY_TOKENS[tok] === dow)
}

export function routinesToday<T extends { cadence: string }>(routines: T[], now: Date): T[] {
  return routines.filter((r) => cadenceMatches(r.cadence, now))
}
