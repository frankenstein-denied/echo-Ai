import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { areaShares, debounce, filterNotes, lastSevenDays, parseSleepInput, parseTags, splitReminders, splitSleep, stepWater } from './view-helpers'

describe('debounce', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('fires once with the last args', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d(1)
    d(2)
    vi.advanceTimersByTime(99)
    expect(fn).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledOnce()
    expect(fn).toHaveBeenCalledWith(2)
  })
  it('flush runs pending immediately, cancel drops it', () => {
    const fn = vi.fn()
    const d = debounce(fn, 100)
    d('a')
    d.flush()
    expect(fn).toHaveBeenCalledWith('a')
    d('b')
    d.cancel()
    vi.advanceTimersByTime(500)
    expect(fn).toHaveBeenCalledOnce()
  })
})

describe('splitReminders', () => {
  it('sorts upcoming ascending, done descending', () => {
    const r = splitReminders([
      { id: 'a', dueMs: 30, done: false },
      { id: 'b', dueMs: 10, done: false },
      { id: 'c', dueMs: 5, done: true },
      { id: 'd', dueMs: 20, done: true },
    ])
    expect(r.upcoming.map((x) => x.id)).toEqual(['b', 'a'])
    expect(r.done.map((x) => x.id)).toEqual(['d', 'c'])
  })
})

describe('notes helpers', () => {
  const notes = [
    { title: 'Thesis', body: 'outline', tags: ['school'] },
    { title: 'Run', body: 'half marathon', tags: [] },
  ]
  it('filters by title, body and tags', () => {
    expect(filterNotes(notes, 'THES')).toHaveLength(1)
    expect(filterNotes(notes, 'marathon')).toHaveLength(1)
    expect(filterNotes(notes, 'school')).toHaveLength(1)
    expect(filterNotes(notes, '  ')).toHaveLength(2)
  })
  it('parses tags', () => {
    expect(parseTags('#a, b,, a\nc')).toEqual(['a', 'b', 'c'])
  })
})

describe('lastSevenDays', () => {
  it('returns 7 days oldest first with gaps as null', () => {
    const s = lastSevenDays('2026-10-25', [{ date: '2026-10-25', mood: 8 }, { date: '2026-10-22', mood: 5 }, { date: '2026-10-24' }])
    expect(s.map((p) => p.date)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
    expect(s.map((p) => p.mood)).toEqual([null, null, null, 5, null, null, 8])
  })
  it('crosses month boundaries', () => {
    expect(lastSevenDays('2026-11-02', [])[0].date).toBe('2026-10-27')
  })
})

describe('misc', () => {
  it('splits sleep', () => {
    expect(splitSleep(462)).toEqual({ hours: 7, minutes: 42 })
    expect(splitSleep(undefined)).toEqual({ hours: 0, minutes: 0 })
  })
  it('computes area shares', () => {
    expect(areaShares([{ category: 'A' }, { category: 'A' }, { category: 'B' }, { category: 'B' }])).toEqual([
      { category: 'A', count: 2, pct: 50 },
      { category: 'B', count: 2, pct: 50 },
    ])
  })
})

describe('health input helpers', () => {
  it('parses sleep input, empty means do not save', () => {
    expect(parseSleepInput('7', '30')).toBe(450)
    expect(parseSleepInput('7', '')).toBe(420)
    expect(parseSleepInput('', '30')).toBeNull()
    expect(parseSleepInput('', '')).toBeNull()
    expect(parseSleepInput('7', 'x')).toBeNull()
    expect(parseSleepInput('25', '0')).toBeNull()
    expect(parseSleepInput('7', '60')).toBeNull()
    expect(parseSleepInput('0', '0')).toBe(0)
  })
  it('steps water within bounds', () => {
    expect(stepWater(0, -1)).toBe(0)
    expect(stepWater(5, 1)).toBe(6)
    expect(stepWater(30, 1)).toBe(30)
  })
})
