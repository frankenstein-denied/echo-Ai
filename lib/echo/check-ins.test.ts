import { describe, expect, it } from 'vitest'
import { bubbleStatusLine, CHECK_IN_GAPS, DEFAULT_WATER_GOAL, MAX_WATER_GOAL, MIN_WATER_GOAL, parseWaterGoal, resolveCheckInSettings } from './check-ins'

describe('resolveCheckInSettings', () => {
  it('uses the defaults for an empty profile', () => {
    expect(resolveCheckInSettings({})).toEqual({ enabled: true, everyMinutes: 120, sleepStart: '22:00', sleepEnd: '07:00', waterGoal: 8 })
  })
  it('starts off for someone who said no in onboarding', () => {
    expect(resolveCheckInSettings({ remindersEnabled: false }).enabled).toBe(false)
    expect(resolveCheckInSettings({ remindersEnabled: false, checkInsEnabled: true }).enabled).toBe(true)
  })
  it('lets the stored switch win over onboarding', () => {
    expect(resolveCheckInSettings({ remindersEnabled: true }).enabled).toBe(true)
    expect(resolveCheckInSettings({ remindersEnabled: true, checkInsEnabled: false }).enabled).toBe(false)
  })
  it('falls back on bad stored values', () => {
    const s = resolveCheckInSettings({ checkInEveryMinutes: 7, sleepStart: '25:00', waterGoal: 99 })
    expect([s.everyMinutes, s.sleepStart, s.waterGoal]).toEqual([120, '22:00', 8])
  })
  it('falls back on a bad sleep end and on water targets outside whole 1 to 30', () => {
    expect(resolveCheckInSettings({ sleepEnd: '7:00' }).sleepEnd).toBe('07:00')
    for (const waterGoal of [0, 31, 2.5]) expect(resolveCheckInSettings({ waterGoal }).waterGoal).toBe(DEFAULT_WATER_GOAL)
  })
  it('keeps good stored values', () => {
    expect(resolveCheckInSettings({ checkInsEnabled: true, checkInEveryMinutes: 360, sleepStart: '23:30', sleepEnd: '06:15', waterGoal: 30 }))
      .toEqual({ enabled: true, everyMinutes: 360, sleepStart: '23:30', sleepEnd: '06:15', waterGoal: 30 })
    expect(resolveCheckInSettings({ waterGoal: 1 }).waterGoal).toBe(1)
  })
  it('accepts every offered gap', () => {
    expect(CHECK_IN_GAPS).toEqual([30, 60, 120, 180, 240, 360])
    for (const checkInEveryMinutes of CHECK_IN_GAPS) expect(resolveCheckInSettings({ checkInEveryMinutes }).everyMinutes).toBe(checkInEveryMinutes)
  })
})

describe('parseWaterGoal', () => {
  it('sets the bounds at 1 and 30', () => {
    expect([MIN_WATER_GOAL, MAX_WATER_GOAL]).toEqual([1, 30])
  })
  it('accepts whole numbers in range', () => {
    expect(parseWaterGoal('1')).toBe(1)
    expect(parseWaterGoal(' 12 ')).toBe(12)
    expect(parseWaterGoal('30')).toBe(30)
  })
  it('rejects anything else', () => {
    for (const t of ['', ' ', '0', '31', '2.5', '-3', '1e1', 'abc']) expect(parseWaterGoal(t)).toBeNull()
  })
})

describe('bubbleStatusLine', () => {
  it('shows nothing on an older APK', () => {
    expect(bubbleStatusLine({})).toBeNull()
  })

  it('says the bubble is on', () => {
    expect(bubbleStatusLine({ bubbleRunning: true, bubbleError: null })).toBe('Bubble: on')
  })

  it('gives the reason when there is one', () => {
    expect(bubbleStatusLine({ bubbleRunning: false, bubbleError: 'start refused: X' })).toBe("Bubble isn't running (start refused: X)")
    expect(bubbleStatusLine({ bubbleRunning: false })).toBe("Bubble isn't running")
  })
})
