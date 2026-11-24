import { describe, expect, it } from 'vitest'
import { formatTimingLine, parseTimingReport, TIMING_LIMITS } from './call-timing'

const report = {
  entry: 'float',
  outcome: 'first_audio',
  marks: [
    ['home mounted', 900],
    ['memories loaded', 1500],
    ['messages loaded', 1700],
    ['tap', 1710],
    ['mic ready', 1900],
    ['session token', 2600],
    ['websocket open', 3000],
    ['listening', 3010],
    ['first audio ready', 3900],
  ],
}

describe('parseTimingReport', () => {
  it('keeps a well-formed report, marks in time order', () => {
    const p = parseTimingReport({ ...report, marks: [...report.marks].reverse() })
    expect(p?.entry).toBe('float')
    expect(p?.marks.map(([s]) => s)).toEqual(report.marks.map(([s]) => s))
  })
  it('rejects unknown entries, outcomes and step names (only timings, never content)', () => {
    expect(parseTimingReport({ ...report, entry: 'x' })).toBeNull()
    expect(parseTimingReport({ ...report, outcome: 'x' })).toBeNull()
    expect(parseTimingReport({ ...report, marks: [['my diary text', 5]] })?.marks).toEqual([])
    expect(parseTimingReport('junk')).toBeNull()
  })
  it('drops bad numbers and caps the list', () => {
    const p = parseTimingReport({ ...report, marks: [['tap', -1], ['tap', Number.NaN], ['tap', 10 ** 9], ...Array.from({ length: 50 }, () => ['tap', 5])] })
    expect(p?.marks.length).toBeLessThanOrEqual(TIMING_LIMITS.marks)
    expect(p?.marks.every(([, ms]) => ms >= 0 && ms <= TIMING_LIMITS.maxMs)).toBe(true)
  })
})

describe('formatTimingLine', () => {
  it('shows each step since page start and the gap from the step before', () => {
    const line = formatTimingLine(parseTimingReport(report)!)
    expect(line).toBe(
      '[call-timing] float first_audio | home mounted 900 | memories loaded 1500 (+600) | messages loaded 1700 (+200) | tap 1710 (+10) | mic ready 1900 (+190) | session token 2600 (+700) | websocket open 3000 (+400) | listening 3010 (+10) | first audio ready 3900 (+890) | tap->audio 2190',
    )
  })
})
