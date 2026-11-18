import { describe, expect, it } from 'vitest'
import { rainUntilMs } from './chathead-mood'

// Manila (UTC+8): the forecast's hourly times are local, without an offset.
const OFFSET = 8 * 3600
const hourly = (probs: number[]) => ({
  time: probs.map((_, i) => `2026-11-19T${String(12 + i).padStart(2, '0')}:00`),
  precipitation_probability: probs,
})
const local = (h: number, m = 0) => Date.UTC(2026, 10, 19, h, m) - OFFSET * 1000

describe('rainUntilMs', () => {
  it('is 0 with no likely rain in the next 3 hours', () => {
    expect(rainUntilMs({ hourly: hourly([10, 20, 30, 40, 90]), utc_offset_seconds: OFFSET }, local(12, 10))).toBe(0)
  })
  it('ends with the last likely-rain hour inside the window', () => {
    // 13:00 and 14:00 are wet (>= 50%): rain ends at 15:00.
    expect(rainUntilMs({ hourly: hourly([10, 60, 80, 20]), utc_offset_seconds: OFFSET }, local(12, 10))).toBe(local(15))
  })
  it('counts the hour it is raining in now', () => {
    expect(rainUntilMs({ hourly: hourly([70, 10, 10]), utc_offset_seconds: OFFSET }, local(12, 40))).toBe(local(13))
  })
  it('ignores rain more than 3 hours away and hours already over', () => {
    expect(rainUntilMs({ hourly: hourly([90, 0, 0, 0, 0, 90]), utc_offset_seconds: OFFSET }, local(13, 5))).toBe(0)
  })
  it('survives missing data', () => {
    expect(rainUntilMs({}, local(12))).toBe(0)
    expect(rainUntilMs({ hourly: { time: ['bad'], precipitation_probability: [99] } }, local(12))).toBe(0)
  })
})
