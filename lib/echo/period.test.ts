import { describe, it, expect } from 'vitest'
import { DEFAULT_PERIOD, PERIOD_OPTIONS, emptyPeriodText, inPeriod, periodDates, periodElapsed, periodRange } from './period'

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min).getTime()

describe('periodRange', () => {
  it('today covers local midnight to next midnight', () => {
    expect(periodRange('today', new Date(2026, 10, 4, 15, 30))).toEqual({ start: d(2026, 11, 4), end: d(2026, 11, 5) })
  })
  it('week for a mid-week day starts on Monday', () => {
    // Wed 2026-11-04
    expect(periodRange('week', new Date(2026, 10, 4, 15))).toEqual({ start: d(2026, 11, 2), end: d(2026, 11, 9) })
  })
  it('a Sunday belongs to the week that began the previous Monday', () => {
    // Sun 2026-11-08
    expect(periodRange('week', new Date(2026, 10, 8, 23, 59))).toEqual({ start: d(2026, 11, 2), end: d(2026, 11, 9) })
  })
  it('a Monday starts its own week', () => {
    expect(periodRange('week', new Date(2026, 10, 2, 0, 0))).toEqual({ start: d(2026, 11, 2), end: d(2026, 11, 9) })
  })
  it('month on Jan 31', () => {
    expect(periodRange('month', new Date(2026, 0, 31, 12))).toEqual({ start: d(2026, 1, 1), end: d(2026, 2, 1) })
  })
  it('month for February in leap year 2028', () => {
    expect(periodRange('month', new Date(2028, 1, 29, 12))).toEqual({ start: d(2028, 2, 1), end: d(2028, 3, 1) })
  })
  it('year covers Jan 1 to the next Jan 1', () => {
    expect(periodRange('year', new Date(2026, 10, 9, 15))).toEqual({ start: d(2026, 1, 1), end: d(2027, 1, 1) })
  })
  it('all returns null', () => {
    expect(periodRange('all', new Date(2026, 10, 4))).toBeNull()
  })
})

describe('inPeriod', () => {
  const now = new Date(2026, 10, 4, 12)
  it('includes start and excludes end', () => {
    expect(inPeriod(d(2026, 11, 4), 'today', now)).toBe(true)
    expect(inPeriod(d(2026, 11, 4) - 1, 'today', now)).toBe(false)
    expect(inPeriod(d(2026, 11, 5), 'today', now)).toBe(false)
    expect(inPeriod(d(2026, 11, 5) - 1, 'today', now)).toBe(true)
    expect(inPeriod(d(2026, 11, 2), 'week', now)).toBe(true)
    expect(inPeriod(d(2026, 11, 9), 'week', now)).toBe(false)
    expect(inPeriod(d(2026, 11, 1), 'month', now)).toBe(true)
    expect(inPeriod(d(2026, 12, 1), 'month', now)).toBe(false)
  })
  it('all is always true, even for missing values', () => {
    expect(inPeriod(0, 'all', now)).toBe(true)
    expect(inPeriod(null, 'all', now)).toBe(true)
    expect(inPeriod(undefined, 'all', now)).toBe(true)
  })
  it('missing values are false for bounded periods', () => {
    expect(inPeriod(null, 'today', now)).toBe(false)
    expect(inPeriod(undefined, 'week', now)).toBe(false)
  })
})

describe('periodDates', () => {
  it('today is one key', () => {
    expect(periodDates('today', new Date(2026, 10, 4, 9))).toEqual(['2026-11-04'])
  })
  it('week is seven ordered keys from Monday', () => {
    const keys = periodDates('week', new Date(2026, 10, 8, 9))
    expect(keys).toHaveLength(7)
    expect(keys[0]).toBe('2026-11-02')
    expect(keys[6]).toBe('2026-11-08')
  })
  it('week can cross a month boundary', () => {
    expect(periodDates('week', new Date(2026, 9, 31))).toEqual([
      '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
    ])
  })
  it('month has one key per day', () => {
    expect(periodDates('month', new Date(2026, 10, 4))).toHaveLength(30)
    expect(periodDates('month', new Date(2026, 0, 31))).toHaveLength(31)
    const feb = periodDates('month', new Date(2028, 1, 10))
    expect(feb).toHaveLength(29)
    expect(feb[0]).toBe('2028-02-01')
    expect(feb[28]).toBe('2028-02-29')
  })
})

describe('options and text', () => {
  it('lists options in order and defaults to today', () => {
    expect(PERIOD_OPTIONS).toEqual([
      { value: 'today', label: 'Today' },
      { value: 'week', label: 'This week' },
      { value: 'month', label: 'This month' },
      { value: 'year', label: 'This year' },
      { value: 'all', label: 'All' },
    ])
    expect(PERIOD_OPTIONS.map((o) => o.label)).toEqual(['Today', 'This week', 'This month', 'This year', 'All'])
    expect(DEFAULT_PERIOD).toBe('today')
  })
  it('names the period in empty text', () => {
    expect(emptyPeriodText('today')).toBe('Nothing for today.')
    expect(emptyPeriodText('week')).toBe('Nothing this week.')
    expect(emptyPeriodText('month')).toBe('Nothing this month.')
    expect(emptyPeriodText('year')).toBe('Nothing this year.')
    expect(emptyPeriodText('all')).toBe('Nothing yet.')
  })
})

describe('periodElapsed', () => {
  it('today runs from 0 at midnight to 100 just before the next', () => {
    expect(periodElapsed('today', new Date(2026, 10, 9, 0, 0))).toBe(0)
    expect(periodElapsed('today', new Date(2026, 10, 9, 12, 0))).toBe(50)
    expect(periodElapsed('today', new Date(2026, 10, 9, 23, 59))).toBe(100)
  })
  it('week starts at 0 on Monday midnight', () => {
    expect(periodElapsed('week', new Date(2026, 10, 9, 0, 0))).toBe(0)
  })
  it('month is half gone after 15 of 30 days', () => {
    expect(periodElapsed('month', new Date(2026, 10, 16, 0, 0))).toBe(50)
  })
  it('year is about half gone on July 2', () => {
    const pct = periodElapsed('year', new Date(2026, 6, 2, 12))
    expect(pct).toBeGreaterThanOrEqual(49)
    expect(pct).toBeLessThanOrEqual(51)
  })
  it('all uses the year', () => {
    for (const day of [new Date(2026, 0, 1), new Date(2026, 6, 2, 12), new Date(2026, 10, 9, 18), new Date(2026, 11, 31, 23, 59)]) {
      expect(periodElapsed('all', day)).toBe(periodElapsed('year', day))
    }
  })
  it('is a whole number between 0 and 100', () => {
    const pct = periodElapsed('week', new Date(2026, 10, 11, 7, 13))
    expect(Number.isInteger(pct)).toBe(true)
    expect(pct).toBeGreaterThanOrEqual(0)
    expect(pct).toBeLessThanOrEqual(100)
  })
})
