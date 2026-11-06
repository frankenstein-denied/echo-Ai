import { describe, expect, it } from 'vitest'
import { bubbleStatusLine, DEFAULT_WATER_GOAL, gapIsUnsaved, gapLabel, gapMinutes, gapParts, MAX_GAP_MINUTES, MAX_WATER_GOAL, MIN_GAP_MINUTES, MIN_WATER_GOAL, parseGap, parseWaterGoal, resolveCheckInSettings, sleepProblem, wakeStatusLines } from './check-ins'

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
    const s = resolveCheckInSettings({ checkInEveryMinutes: 0, sleepStart: '25:00', waterGoal: 99 })
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
  it('accepts any whole gap in range, the old fixed choices included', () => {
    for (const checkInEveryMinutes of [1, 5, 7, 30, 45, 360, 1440, 43200]) expect(resolveCheckInSettings({ checkInEveryMinutes }).everyMinutes).toBe(checkInEveryMinutes)
  })
  it('falls back on gaps out of range or not whole', () => {
    for (const checkInEveryMinutes of [-30, 0, 43201, 45.5, Number.NaN]) expect(resolveCheckInSettings({ checkInEveryMinutes }).everyMinutes).toBe(120)
  })
})

describe('gapParts', () => {
  it('uses days, then hours, then minutes', () => {
    expect(gapParts(2880)).toEqual({ value: 2, unit: 'days' })
    expect(gapParts(1440)).toEqual({ value: 1, unit: 'days' })
    expect(gapParts(120)).toEqual({ value: 2, unit: 'hours' })
    expect(gapParts(1500)).toEqual({ value: 25, unit: 'hours' })
    expect(gapParts(90)).toEqual({ value: 90, unit: 'minutes' })
    expect(gapParts(5)).toEqual({ value: 5, unit: 'minutes' })
  })
  it('reads the limits', () => {
    expect(gapParts(MAX_GAP_MINUTES)).toEqual({ value: 30, unit: 'days' })
    expect(gapParts(MIN_GAP_MINUTES)).toEqual({ value: 1, unit: 'minutes' })
  })
})

describe('gapMinutes', () => {
  it('converts each unit', () => {
    expect(gapMinutes(45, 'minutes')).toBe(45)
    expect(gapMinutes(3, 'hours')).toBe(180)
    expect(gapMinutes(2, 'days')).toBe(2880)
  })
  it('undoes gapParts', () => {
    for (const m of [5, 90, 120, 1440, 1500, 43200]) {
      const { value, unit } = gapParts(m)
      expect(gapMinutes(value, unit)).toBe(m)
    }
  })
})

describe('parseGap', () => {
  it('takes whole numbers in range, in any unit', () => {
    expect(parseGap('5', 'minutes')).toBe(5)
    expect(parseGap(' 45 ', 'minutes')).toBe(45)
    expect(parseGap('43200', 'minutes')).toBe(43200)
    expect(parseGap('1', 'hours')).toBe(60)
    expect(parseGap('720', 'hours')).toBe(43200)
    expect(parseGap('1', 'days')).toBe(1440)
    expect(parseGap('30', 'days')).toBe(43200)
  })
  it('rejects anything past the limits', () => {
    expect(parseGap('0', 'minutes')).toBeNull()
    expect(parseGap('43201', 'minutes')).toBeNull()
    expect(parseGap('721', 'hours')).toBeNull()
    expect(parseGap('31', 'days')).toBeNull()
    expect(parseGap('99999999999999999999', 'days')).toBeNull()
  })
  it('rejects zero and anything that is not a whole positive number', () => {
    for (const raw of ['0', '', '   ', '-5', '1.5', '1e3', '2h', 'abc']) expect(parseGap(raw, 'hours')).toBeNull()
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

describe('gapIsUnsaved', () => {
  it('is false for what is stored, in any unit', () => {
    expect(gapIsUnsaved('2', 'hours', 120)).toBe(false)
    expect(gapIsUnsaved('120', 'minutes', 120)).toBe(false)
  })

  it('is true for a different gap', () => {
    expect(gapIsUnsaved('3', 'hours', 120)).toBe(true)
    expect(gapIsUnsaved('2', 'minutes', 120)).toBe(true)
  })

  it('is true for invalid input, so Save can show why', () => {
    expect(gapIsUnsaved('', 'hours', 120)).toBe(true)
    expect(gapIsUnsaved('31', 'days', 120)).toBe(true)
  })
})

describe('gapLabel', () => {
  it('uses the largest whole unit and the right plural', () => {
    expect(gapLabel(120)).toBe('2 hours')
    expect(gapLabel(60)).toBe('1 hour')
    expect(gapLabel(1440)).toBe('1 day')
    expect(gapLabel(90)).toBe('90 minutes')
    expect(gapLabel(1)).toBe('1 minute')
  })
})

describe('sleepProblem', () => {
  it('needs both times, and two different ones', () => {
    expect(sleepProblem('', '07:00')).toBe('Enter both times.')
    expect(sleepProblem('22:00', '')).toBe('Enter both times.')
    expect(sleepProblem('22:00', '22:00')).toBe('Sleep start and end must be different.')
    expect(sleepProblem('22:00', '07:00')).toBe('')
  })
})

describe('wakeStatusLines', () => {
  it('shows nothing on an older APK', () => {
    expect(wakeStatusLines({})).toEqual([])
  })

  it('shows what is known', () => {
    expect(wakeStatusLines({ lastWake: 'alarm 18:40: POPUP', nextWake: '18:45' })).toEqual(['Last wake: alarm 18:40: POPUP', 'Next wake: 18:45'])
    expect(wakeStatusLines({ lastWake: null, nextWake: 'Sat 07:00' })).toEqual(['Next wake: Sat 07:00'])
  })
})

describe('bubbleStatusLine', () => {
  it('shows nothing on an older APK', () => {
    expect(bubbleStatusLine({})).toBeNull()
  })

  it('says the bubble is on', () => {
    expect(bubbleStatusLine({ bubbleRunning: true, bubbleError: null })).toBe('Bubble: on')
  })

  it('never says on while an error is recorded', () => {
    expect(bubbleStatusLine({ bubbleRunning: true, bubbleError: 'check-ins failed: X' })).toBe("Bubble isn't running (check-ins failed: X)")
  })

  it('gives the reason when there is one', () => {
    expect(bubbleStatusLine({ bubbleRunning: false, bubbleError: 'start refused: X' })).toBe("Bubble isn't running (start refused: X)")
    expect(bubbleStatusLine({ bubbleRunning: false })).toBe("Bubble isn't running")
  })
})
