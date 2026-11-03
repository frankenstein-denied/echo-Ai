import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { areaShares, chartDays, debounce, filterNotes, goalsInPeriod, healthPeriodDates, healthPeriodStats, lastSevenDays, mealsByDay, notesInPeriod, parseSleepInput, parseTags, remindersInPeriod, safeSourceUrl, sanitizeSources, splitReminders, splitSleep, stepWater } from './view-helpers'

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

describe('safeSourceUrl / sanitizeSources', () => {
  it('accepts only http(s) urls and returns the normalized href', () => {
    expect(safeSourceUrl('https://example.com')).toBe('https://example.com/')
    expect(safeSourceUrl('http://a.org/x?y=1')).toBe('http://a.org/x?y=1')
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://a.org', 'not a url', '', '//a.org']) expect(safeSourceUrl(bad)).toBeNull()
  })
  it('drops unsafe sources, trims, caps lengths and count', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, url: `https://a.org/${i}` }))
    expect(sanitizeSources([{ title: ' Hi ', url: 'javascript:x' }, { title: 'x'.repeat(300), url: 'https://a.org' }])).toEqual([{ title: 'x'.repeat(200), url: 'https://a.org/' }])
    expect(sanitizeSources(many)).toHaveLength(5)
    expect(sanitizeSources([{ title: 'L', url: 'https://a.org/' + 'p'.repeat(600) }])).toEqual([])
    expect(sanitizeSources(undefined)).toEqual([])
  })
})

describe('period selectors', () => {
  const now = new Date(2026, 10, 4, 12, 0) // Wed 4 Nov 2026, local
  const at = (d: number, h = 9) => new Date(2026, 10, d, h).getTime()

  describe('notesInPeriod', () => {
    const notes = [
      { id: 'created-today', createdMs: at(4), updatedMs: at(4) },
      { id: 'updated-today', createdMs: at(1, 9) - 40 * 86400000, updatedMs: at(4, 8) },
      { id: 'this-week', createdMs: at(2), updatedMs: at(2) },
      { id: 'old', createdMs: at(1) - 90 * 86400000, updatedMs: at(1) - 90 * 86400000 },
      { id: 'pending', createdMs: null, updatedMs: null },
    ]
    it('matches createdAt or updatedAt in the period', () => {
      expect(notesInPeriod(notes, 'today', now).map((n) => n.id)).toEqual(['created-today', 'updated-today'])
      expect(notesInPeriod(notes, 'week', now).map((n) => n.id)).toEqual(['created-today', 'updated-today', 'this-week'])
    })
    it('all returns everything', () => {
      expect(notesInPeriod(notes, 'all', now)).toHaveLength(5)
    })
  })

  describe('goalsInPeriod', () => {
    const goals = [
      { id: 'new', createdMs: at(4), updatedMs: at(4) },
      { id: 'target-today', createdMs: at(1) - 90 * 86400000, updatedMs: at(1) - 90 * 86400000, targetDate: '2026-11-04' },
      { id: 'target-month', createdMs: at(1) - 90 * 86400000, updatedMs: null, targetDate: '2026-11-30' },
      { id: 'target-next-month', createdMs: at(1) - 90 * 86400000, updatedMs: null, targetDate: '2026-12-01' },
      { id: 'bad-target', createdMs: at(1) - 90 * 86400000, updatedMs: null, targetDate: 'soon' },
      { id: 'none', createdMs: at(1) - 90 * 86400000, updatedMs: null },
    ]
    it('matches created/updated or the target date (local date)', () => {
      expect(goalsInPeriod(goals, 'today', now).map((g) => g.id)).toEqual(['new', 'target-today'])
      expect(goalsInPeriod(goals, 'month', now).map((g) => g.id)).toEqual(['new', 'target-today', 'target-month'])
    })
    it('target date on the last day of week is in, next Monday is out', () => {
      const g = [{ id: 'sun', createdMs: null, updatedMs: null, targetDate: '2026-11-08' }, { id: 'mon', createdMs: null, updatedMs: null, targetDate: '2026-11-09' }]
      expect(goalsInPeriod(g, 'week', now).map((x) => x.id)).toEqual(['sun'])
    })
    it('all returns everything', () => {
      expect(goalsInPeriod(goals, 'all', now)).toHaveLength(6)
    })
  })

  describe('remindersInPeriod', () => {
    const rs = [
      { id: 'today', dueMs: at(4, 18), done: false },
      { id: 'overdue', dueMs: at(1), done: false },
      { id: 'overdue-done', dueMs: at(1), done: true },
      { id: 'tomorrow', dueMs: at(5), done: false },
      { id: 'next-month', dueMs: new Date(2026, 11, 2).getTime(), done: false },
    ]
    it('today includes overdue not-done reminders', () => {
      expect(remindersInPeriod(rs, 'today', now).map((r) => r.id)).toEqual(['today', 'overdue'])
    })
    it('week and month include overdue not-done and in-range', () => {
      expect(remindersInPeriod(rs, 'week', now).map((r) => r.id)).toEqual(['today', 'overdue', 'tomorrow'])
      expect(remindersInPeriod(rs, 'month', now).map((r) => r.id)).toEqual(['today', 'overdue', 'overdue-done', 'tomorrow'])
    })
    it('overdue from a previous month still shows for today', () => {
      const old = [{ id: 'old', dueMs: new Date(2026, 8, 1).getTime(), done: false }]
      expect(remindersInPeriod(old, 'month', now)).toHaveLength(1)
    })
    it('all returns everything', () => {
      expect(remindersInPeriod(rs, 'all', now)).toHaveLength(5)
    })
  })
})

describe('health period helpers', () => {
  const now = new Date(2026, 10, 4, 12, 0) // Wed 4 Nov 2026, local

  describe('healthPeriodDates', () => {
    it('today keeps the last 7 days ending today', () => {
      expect(healthPeriodDates('today', now)).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'])
    })
    it('week is Mon-Sun of this calendar week, including future days', () => {
      expect(healthPeriodDates('week', now)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    })
    it('month is every day of this month', () => {
      const d = healthPeriodDates('month', now)
      expect(d).toHaveLength(30)
      expect(d[0]).toBe('2026-11-01')
      expect(d[29]).toBe('2026-11-30')
    })
    it('all is the last 90 days ending today', () => {
      const d = healthPeriodDates('all', now)
      expect(d).toHaveLength(90)
      expect(d[0]).toBe('2026-08-07')
      expect(d[89]).toBe('2026-11-04')
    })
  })

  describe('chartDays', () => {
    it('maps keys to points with weekday labels for up to 7 days', () => {
      const s = chartDays(['2026-11-02', '2026-11-03', '2026-11-04'], [{ date: '2026-11-03', mood: 7 }, { date: '2026-11-01', mood: 2 }])
      expect(s).toEqual([
        { date: '2026-11-02', label: 'Mon', mood: null },
        { date: '2026-11-03', label: 'Tue', mood: 7 },
        { date: '2026-11-04', label: 'Wed', mood: null },
      ])
    })
    it('uses short dates for longer ranges', () => {
      const s = chartDays(healthPeriodDates('month', now), [])
      expect(s[0].label).toBe('Nov 1')
      expect(s[29].label).toBe('Nov 30')
    })
    it('lastSevenDays is chartDays over the 7 days ending today', () => {
      const logs = [{ date: '2026-11-04', mood: 8 }]
      expect(lastSevenDays('2026-11-04', logs)).toEqual(chartDays(healthPeriodDates('today', now), logs))
    })
  })

  describe('healthPeriodStats', () => {
    const dates = healthPeriodDates('week', now)
    it('averages only over days that have data inside the dates', () => {
      const logs = [
        { date: '2026-11-02', mood: 8, sleepMinutes: 420 },
        { date: '2026-11-03', moodTag: 'sad', sleepMinutes: 480 }, // tag only: scored 3
        { date: '2026-11-04' }, // nothing logged
        { date: '2026-10-30', mood: 1, sleepMinutes: 60 }, // outside the week
      ]
      const meals = [
        { date: '2026-11-02', totalCalories: 500 },
        { date: '2026-11-02', totalCalories: 700 },
        { date: '2026-11-04', totalCalories: 900 },
        { date: '2026-10-30', totalCalories: 5000 },
      ]
      expect(healthPeriodStats(dates, logs, meals)).toEqual({
        avgMood: 5.5,
        moodDays: 2,
        avgSleepMinutes: 450,
        sleepDays: 2,
        totalCalories: 2100,
        avgDailyCalories: 1050,
        mealDays: 2,
      })
    })
    it('returns nulls when there is no data', () => {
      expect(healthPeriodStats(dates, [], [])).toEqual({ avgMood: null, moodDays: 0, avgSleepMinutes: null, sleepDays: 0, totalCalories: 0, avgDailyCalories: null, mealDays: 0 })
    })
    it('rounds averages (mood to 1 decimal, sleep and calories to whole numbers)', () => {
      const s = healthPeriodStats(dates, [{ date: '2026-11-02', mood: 8, sleepMinutes: 400 }, { date: '2026-11-03', mood: 7, sleepMinutes: 401 }, { date: '2026-11-04', mood: 7, sleepMinutes: 401 }], [{ date: '2026-11-02', totalCalories: 100 }, { date: '2026-11-03', totalCalories: 101 }, { date: '2026-11-04', totalCalories: 101 }])
      expect(s.avgMood).toBe(7.3)
      expect(s.avgSleepMinutes).toBe(401)
      expect(s.avgDailyCalories).toBe(101)
    })
  })

  describe('mealsByDay', () => {
    it('groups by date newest first, keeping order within a day, with day totals', () => {
      const meals = [
        { id: 'a', date: '2026-11-02', totalCalories: 300 },
        { id: 'b', date: '2026-11-04', totalCalories: 400 },
        { id: 'c', date: '2026-11-02', totalCalories: 200 },
      ]
      expect(mealsByDay(meals)).toEqual([
        { date: '2026-11-04', total: 400, meals: [meals[1]] },
        { date: '2026-11-02', total: 500, meals: [meals[0], meals[2]] },
      ])
    })
    it('is empty for no meals', () => {
      expect(mealsByDay([])).toEqual([])
    })
  })
})
