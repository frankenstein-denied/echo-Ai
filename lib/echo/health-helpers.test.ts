import { describe, expect, it } from 'vitest'
import { dailyTotals, goalProgress, groupByMealType, itemsTotal, moodFromScore, moodScore, moodTagOf, MOOD_TAGS, parseCalorieGoal, sanitizeItems, validateMeal } from './health-helpers'

describe('mood mapping', () => {
  it('maps tags to scores', () => {
    expect(MOOD_TAGS.map(moodScore)).toEqual([9, 8, 6, 4, 3, 3, 2])
  })
  it('maps legacy scores to the nearest tag', () => {
    expect([10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map(moodFromScore)).toEqual(['great', 'great', 'happy', 'happy', 'okay', 'okay', 'tired', 'sad', 'angry', 'angry'])
    expect(moodFromScore(undefined)).toBeNull()
    expect(moodFromScore(NaN)).toBeNull()
  })
  it('prefers the stored tag over the score', () => {
    expect(moodTagOf({ moodTag: 'anxious', mood: 3 })).toBe('anxious')
    expect(moodTagOf({ mood: 8 })).toBe('happy')
    expect(moodTagOf({ moodTag: 'bogus', mood: 2 })).toBe('angry')
    expect(moodTagOf({})).toBeNull()
    expect(moodTagOf(null)).toBeNull()
  })
})

describe('meal validation', () => {
  const base = { date: '2026-10-26', mealType: 'lunch', source: 'manual' }
  it('requires a description or items, and calories', () => {
    expect(validateMeal({ ...base, description: ' ', totalCalories: 100 }).ok).toBe(false)
    expect(validateMeal({ ...base, description: 'Soup' }).ok).toBe(false)
    const ok = validateMeal({ ...base, description: ' Soup ', totalCalories: '250.4' })
    expect(ok).toEqual({ ok: true, value: { date: '2026-10-26', mealType: 'lunch', description: 'Soup', items: [], totalCalories: 250, source: 'manual', estimated: false } })
  })
  it('sums items and builds a description from them', () => {
    const r = validateMeal({ ...base, description: '', items: [{ name: 'Rice', quantity: '1 cup', calories: 200 }, { name: 'Egg', quantity: '', calories: 80 }], totalCalories: 5 })
    expect(r.ok && r.value.totalCalories).toBe(280)
    expect(r.ok && r.value.description).toBe('Rice, Egg')
  })
  it('rejects bad date, type and oversized totals', () => {
    expect(validateMeal({ ...base, date: '26-10-2026', description: 'a', totalCalories: 1 }).ok).toBe(false)
    expect(validateMeal({ ...base, mealType: 'brunch', description: 'a', totalCalories: 1 }).ok).toBe(false)
    const big = validateMeal({ ...base, description: 'a', items: Array.from({ length: 5 }, () => ({ name: 'x', calories: 5000 })) })
    expect(big.ok).toBe(false)
  })
  it('clamps totals typed without items and unknown sources fall back to manual', () => {
    const r = validateMeal({ ...base, description: 'Feast', totalCalories: 99999, source: 'weird' })
    expect(r.ok && r.value.totalCalories).toBe(20000)
    expect(r.ok && r.value.source).toBe('manual')
  })
})

describe('sanitizeItems', () => {
  it('trims, clamps, drops unusable and caps at 20', () => {
    const items = sanitizeItems([
      { name: '  Pasta ', quantity: ' 1 bowl ', calories: 650.6, protein: 20, carbs: '90', fat: -3 },
      { name: '', calories: 10 },
      { name: 'Ghost', calories: 'abc' },
      { name: 'Huge', quantity: 'x'.repeat(100), calories: 99999 },
      null,
    ])
    expect(items).toEqual([
      { name: 'Pasta', quantity: '1 bowl', calories: 651, protein: 20, carbs: 90, fat: 0 },
      { name: 'Huge', quantity: 'x'.repeat(60), calories: 5000 },
    ])
    expect(sanitizeItems(Array.from({ length: 30 }, (_, i) => ({ name: `i${i}`, calories: 1 })))).toHaveLength(20)
    expect(sanitizeItems('nope')).toEqual([])
  })
})

describe('totals and progress', () => {
  it('sums per day with zeros for missing days', () => {
    const meals = [{ date: 'a', totalCalories: 300 }, { date: 'a', totalCalories: 200 }, { date: 'b', totalCalories: 50 }]
    expect(dailyTotals(meals, ['a', 'b', 'c'])).toEqual([{ date: 'a', calories: 500 }, { date: 'b', calories: 50 }, { date: 'c', calories: 0 }])
    expect(itemsTotal([{ calories: 1 }, { calories: 2 }])).toBe(3)
  })
  it('computes goal progress', () => {
    expect(goalProgress(500, 2000)).toEqual({ pct: 25, remaining: 1500, over: 0 })
    expect(goalProgress(2500, 2000)).toEqual({ pct: 100, remaining: 0, over: 500 })
    expect(goalProgress(100, undefined)).toBeNull()
    expect(goalProgress(100, 0)).toBeNull()
  })
  it('groups by meal type in day order', () => {
    const g = groupByMealType([{ mealType: 'dinner' as const, n: 1 }, { mealType: 'breakfast' as const, n: 2 }, { mealType: 'dinner' as const, n: 3 }])
    expect(g.map((x) => [x.type, x.meals.length])).toEqual([['breakfast', 1], ['dinner', 2]])
  })
  it('parses the calorie goal', () => {
    expect(parseCalorieGoal('')).toBeUndefined()
    expect(parseCalorieGoal(' 2000 ')).toBe(2000)
    expect(parseCalorieGoal('799')).toBeNull()
    expect(parseCalorieGoal('6001')).toBeNull()
    expect(parseCalorieGoal('20.5')).toBeNull()
  })
})
