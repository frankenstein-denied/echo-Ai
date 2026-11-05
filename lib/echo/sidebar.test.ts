import { describe, expect, it } from 'vitest'
import { BRAIN_GRADIENT, NAV_COLOR, NAV_GROUPS, dueTodayCount, weekDates, weekStartMs, weekStrip } from './sidebar'
import { ORB_COLOR } from './orbs'

const d = (y: number, m: number, day: number, h = 12, min = 0) => new Date(y, m, day, h, min)

describe('nav constants', () => {
  it('groups items in order', () => {
    expect(NAV_GROUPS.map((g) => [g.label, g.items])).toEqual([
      ['Capture', ['Diary', 'Notes']],
      ['Track', ['Goals', 'Health', 'Reminders']],
      ['Mind', ['2nd Brain', 'Connectors']],
    ])
    expect(NAV_COLOR.Diary).toBe('#2dd4bf')
    expect(NAV_COLOR.Goals).toBe(ORB_COLOR.goal)
    expect(NAV_COLOR.Connectors).toBe('#94a3b8')
  })
  it('gradient repeats first colour at end', () => {
    expect(BRAIN_GRADIENT.startsWith('conic-gradient(')).toBe(true)
    expect(BRAIN_GRADIENT.endsWith(`${ORB_COLOR.note})`)).toBe(true)
  })
})

describe('dueTodayCount', () => {
  const now = d(2026, 10, 5, 10)
  it('counts overdue and later today, excludes tomorrow and done', () => {
    const items = [
      { dueMs: d(2026, 10, 4, 9).getTime(), done: false },
      { dueMs: d(2026, 10, 5, 22).getTime(), done: false },
      { dueMs: d(2026, 10, 6, 0, 0).getTime(), done: false },
      { dueMs: d(2026, 10, 5, 9).getTime(), done: true },
    ]
    expect(dueTodayCount(items, now)).toBe(2)
  })
})

describe('weekDates', () => {
  it('Sunday belongs to the week starting the previous Monday', () => {
    expect(weekDates(d(2026, 10, 8))).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
    ])
  })
  it('Monday starts the week', () => {
    expect(weekDates(d(2026, 10, 2))[0]).toBe('2026-11-02')
    expect(weekStartMs(d(2026, 10, 2, 15))).toBe(d(2026, 10, 2, 0).getTime())
  })
})

describe('weekStrip', () => {
  const now = d(2026, 10, 5, 10) // Thursday
  const mon = d(2026, 10, 2, 9).getTime()
  const wed = d(2026, 10, 4, 9).getTime()
  it('has 7 days with letters, today flag and states', () => {
    const w = weekStrip([{ id: 'a', createdMs: mon, lastMs: mon, messageCount: 2 }], now)
    expect(w.map((x) => x.letter).join('')).toBe('MTWTFSS')
    expect(w.map((x) => x.state)).toEqual(['used', 'empty', 'empty', 'empty', 'future', 'future', 'future'])
    expect(w.map((x) => x.isToday)).toEqual([false, false, false, true, false, false, false])
    expect(w[0].counts).toEqual({ note: 0, goal: 0, reminder: 0, health: 0, person: 0, interest: 0 })
  })
  it('page created Mon last used Wed appears on both, mix summed, latest wins pageId', () => {
    const w = weekStrip(
      [
        { id: 'a', createdMs: mon, lastMs: wed, messageCount: 3, mix: { note: 2, goal: 1 } },
        { id: 'b', createdMs: wed, lastMs: wed + 1000, messageCount: 1, mix: { note: 1, health: -4 } },
      ],
      now,
    )
    expect(w[0].pageId).toBe('a')
    expect(w[2].pageId).toBe('b')
    expect(w[2].counts.note).toBe(3)
    expect(w[2].counts.goal).toBe(1)
    expect(w[2].counts.health).toBe(0)
  })
  it('ignores empty pages', () => {
    const w = weekStrip([{ id: 'a', createdMs: mon, lastMs: mon }, { id: 'b', createdMs: mon, lastMs: mon, messageCount: 0 }], now)
    expect(w[0].state).toBe('empty')
    expect(w[0].pageId).toBeNull()
  })
})
