import { describe, expect, it } from 'vitest'
import { averageLogged, calorieFill, NO_GOAL_KCAL_SCALE, waterFill } from './body-fill'
import { DEFAULT_WATER_GOAL } from './check-ins'

describe('waterFill', () => {
  it('fills to glasses / 8', () => {
    expect(DEFAULT_WATER_GOAL).toBe(8)
    expect(waterFill(5)).toEqual({ level: 0.625, full: false, text: '5 / 8 glasses', sub: '3 to go' })
  })
  it('caps at full past the target', () => {
    expect(waterFill(12)).toEqual({ level: 1, full: true, text: '12 / 8 glasses', sub: 'goal reached' })
    expect(waterFill(8).sub).toBe('goal reached')
  })
  it('treats negative and NaN as zero', () => {
    for (const g of [-3, NaN]) {
      const f = waterFill(g)
      expect(f.level).toBe(0)
      expect(f.text).toBe('0 / 8 glasses')
      expect(f.sub).toBe('8 to go')
    }
  })
  it('fills against the given target', () => {
    expect(waterFill(5, 10)).toEqual({ level: 0.5, full: false, text: '5 / 10 glasses', sub: '5 to go' })
    expect(waterFill(5).text).toBe('5 / 8 glasses')
  })
  it('falls back to the default on a bad target', () => {
    for (const t of [NaN, Infinity, 0, -2, 0.5]) expect(waterFill(5, t).text).toBe('5 / 8 glasses')
  })
  it('keeps one decimal for averages', () => {
    expect(waterFill(5.5).text).toBe('5.5 / 8 glasses')
  })
})

describe('calorieFill', () => {
  it('fills toward the goal', () => {
    expect(calorieFill(1350, 2000)).toEqual({ level: 0.675, over: false, noGoal: false, text: '1,350 of 2,000 kcal', sub: '650 left' })
  })
  it('is full and over past the goal', () => {
    const f = calorieFill(2200, 2000)
    expect(f.level).toBe(1)
    expect(f.over).toBe(true)
    expect(f.sub).toBe('200 over')
  })
  it('scales to 2,000 kcal without a goal', () => {
    expect(NO_GOAL_KCAL_SCALE).toBe(2000)
    expect(calorieFill(1350, undefined)).toEqual({ level: 0.675, over: false, noGoal: true, text: '1,350 kcal today', sub: '' })
  })
  it('is empty at zero', () => {
    const f = calorieFill(0, 2000)
    expect(f.level).toBe(0)
    expect(f.sub).toBe('2,000 left')
  })
  it('treats negative and NaN kcal as zero and rounds', () => {
    expect(calorieFill(NaN, 2000).text).toBe('0 of 2,000 kcal')
    expect(calorieFill(-50, undefined).level).toBe(0)
    expect(calorieFill(1349.6, 2000).text).toBe('1,350 of 2,000 kcal')
  })
})

describe('averageLogged', () => {
  it('averages finite values only', () => {
    expect(averageLogged([4, null, 6, undefined])).toBe(5)
    expect(averageLogged([3, NaN, Infinity])).toBe(3)
  })
  it('is null with nothing logged', () => {
    expect(averageLogged([null])).toBeNull()
    expect(averageLogged([])).toBeNull()
  })
})
