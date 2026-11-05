import { describe, expect, it } from 'vitest'
import { cadenceMatches, reminderTimeline, routinesToday } from './reminders-helpers'

const now = new Date(2026, 10, 5, 12, 0, 0) // Thu 5 Nov 2026
const at = (dayOffset: number, h = 0, m = 0) => new Date(2026, 10, 5 + dayOffset, h, m).getTime()
const item = (id: string, dueMs: number, done = false) => ({ id, dueMs, done })
const ids = (l: { id: string }[]) => l.map((i) => i.id)

describe('reminderTimeline', () => {
  it('buckets not-done items at every boundary', () => {
    const t = reminderTimeline(
      [
        item('past', now.getTime() - 1),
        item('now', now.getTime()),
        item('eod', at(1) - 1),
        item('tom', at(1)),
        item('tomEnd', at(2) - 1),
        item('d2', at(2)),
        item('d6end', at(7) - 1),
        item('d7', at(7)),
      ],
      now,
    )
    expect(ids(t.overdue)).toEqual(['past'])
    expect(ids(t.upcoming)).toEqual(['now', 'eod'])
    expect(ids(t.tomorrow)).toEqual(['tom', 'tomEnd'])
    expect(ids(t.thisWeek)).toEqual(['d2', 'd6end'])
    expect(ids(t.later)).toEqual(['d7'])
  })

  it('buckets done items', () => {
    const t = reminderTimeline(
      [
        item('today', at(0, 8), true),
        item('todayLate', at(0, 23), true),
        item('yest', at(-1, 23), true),
        item('tom', at(1), true),
      ],
      now,
    )
    expect(ids(t.doneToday)).toEqual(['today', 'todayLate'])
    expect(ids(t.doneEarlier)).toEqual(['yest', 'tom'])
    expect(t.overdue).toEqual([])
  })

  it('sorts each list by dueMs ascending', () => {
    const t = reminderTimeline([item('b', at(0, 20)), item('a', at(0, 14)), item('c', at(-3)), item('d', at(-5))], now)
    expect(ids(t.upcoming)).toEqual(['a', 'b'])
    expect(ids(t.overdue)).toEqual(['d', 'c'])
  })
})

describe('cadenceMatches', () => {
  const thu = new Date(2026, 10, 5)
  const wed = new Date(2026, 10, 4)
  const sat = new Date(2026, 10, 7)
  const sun = new Date(2026, 10, 8)
  it('daily synonyms', () => {
    for (const c of ['daily', ' Every Day ', 'everyday', 'each day', 'nightly', 'every night', 'every morning']) {
      expect(cadenceMatches(c, thu)).toBe(true)
    }
  })
  it('weekdays and weekends', () => {
    expect(cadenceMatches('Weekdays', thu)).toBe(true)
    expect(cadenceMatches('weekdays', sat)).toBe(false)
    expect(cadenceMatches('weekends', sat)).toBe(true)
    expect(cadenceMatches('weekends', sun)).toBe(true)
    expect(cadenceMatches('weekends', thu)).toBe(false)
  })
  it('day lists', () => {
    expect(cadenceMatches('Mon/Wed/Fri', wed)).toBe(true)
    expect(cadenceMatches('Mon/Wed/Fri', thu)).toBe(false)
    expect(cadenceMatches('Tues & Thurs', thu)).toBe(true)
    expect(cadenceMatches('Tues & Thurs', wed)).toBe(false)
    expect(cadenceMatches('sunday', sun)).toBe(true)
  })
  it('unknown cadences are false', () => {
    expect(cadenceMatches('Weekly', thu)).toBe(false)
    expect(cadenceMatches('Monthly', thu)).toBe(false)
    expect(cadenceMatches('', thu)).toBe(false)
  })
})

describe('routinesToday', () => {
  it('filters routines by cadence', () => {
    const rs = [{ cadence: 'daily' }, { cadence: 'Mon' }, { cadence: 'Thu' }]
    expect(routinesToday(rs, now)).toEqual([rs[0], rs[2]])
  })
})
