import { describe, expect, it } from 'vitest'
import { dayKey, groupByDay, reminderSections, snoozeUntil } from './day-groups'

const TZ = 'Asia/Manila' // UTC+8, no DST
// Tue 24 Nov 2026, 10:00 in Manila = 02:00 UTC.
const now = Date.UTC(2026, 10, 24, 2, 0)
// Local Manila time → epoch ms.
const at = (day: number, h = 12, m = 0) => Date.UTC(2026, 10, day, h - 8, m)

describe('dayKey', () => {
  it('uses the given time zone, not UTC', () => {
    // 23:30 UTC on the 23rd is 07:30 on the 24th in Manila.
    expect(dayKey(Date.UTC(2026, 10, 23, 23, 30), TZ)).toBe('2026-11-24')
    expect(dayKey(Date.UTC(2026, 10, 23, 23, 30), 'UTC')).toBe('2026-11-23')
  })
})

describe('groupByDay', () => {
  const items = [
    { id: 'old', ms: at(20, 9) },
    { id: 'today-early', ms: at(24, 7) },
    { id: 'yday', ms: at(23, 22) },
    { id: 'today-late', ms: at(24, 9) },
    { id: 'lastyear', ms: Date.UTC(2025, 11, 30, 4) },
  ]
  const groups = groupByDay(items, (i) => i.ms, now, TZ)

  it('labels Today, Yesterday, then weekday + date, newest first', () => {
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Fri, Nov 20', 'Tue, Dec 30, 2025'])
  })

  it('sorts items newest first inside a day', () => {
    expect(groups[0].items.map((i) => i.id)).toEqual(['today-late', 'today-early'])
  })

  it('splits days by the local time zone', () => {
    // 07:00 Manila on the 24th is still the 23rd in UTC.
    const utc = groupByDay([{ ms: at(24, 7) }], (i) => i.ms, now, 'UTC')
    expect(utc[0].label).toBe('Yesterday')
  })

  it('returns no groups for no items', () => {
    expect(groupByDay([], () => 0, now, TZ)).toEqual([])
  })
})

describe('reminderSections', () => {
  const r = (id: string, dueMs: number, done = false) => ({ id, dueMs, done })
  const list = [
    r('later', at(28, 9)),
    r('tomorrow', at(25, 18)),
    r('overdue', at(22, 9)),
    r('soon', at(24, 15)),
    r('earlier-today', at(24, 8)),
    r('done-old', at(20, 9), true),
    r('done-today', at(24, 7), true),
    r('tomorrow-late', at(25, 23, 59)),
  ]
  const sections = reminderSections(list, now, TZ)
  const byKey = Object.fromEntries(sections.map((s) => [s.key, s.items.map((i) => i.id)]))

  it('orders Today, Tomorrow, Later, Done with done last', () => {
    expect(sections.map((s) => s.label)).toEqual(['Today', 'Tomorrow', 'Later', 'Done'])
  })

  it('puts overdue reminders in Today, oldest first', () => {
    expect(byKey.today).toEqual(['overdue', 'earlier-today', 'soon'])
  })

  it('splits Tomorrow and Later on the local day', () => {
    expect(byKey.tomorrow).toEqual(['tomorrow', 'tomorrow-late'])
    expect(byKey.later).toEqual(['later'])
  })

  it('lists done reminders newest first', () => {
    expect(byKey.done).toEqual(['done-today', 'done-old'])
  })

  it('leaves out empty sections', () => {
    expect(reminderSections([r('x', at(24, 15))], now, TZ).map((s) => s.key)).toEqual(['today'])
    expect(reminderSections([], now, TZ)).toEqual([])
  })
})

describe('snoozeUntil', () => {
  const MIN = 60_000
  it('moves an overdue or due-now reminder to 30 minutes from now', () => {
    expect(snoozeUntil(now - 60 * MIN, now)).toBe(now + 30 * MIN)
    expect(snoozeUntil(now, now)).toBe(now + 30 * MIN)
  })
  it('moves a future reminder 30 minutes later', () => {
    expect(snoozeUntil(now + 10 * MIN, now)).toBe(now + 40 * MIN)
  })
})
