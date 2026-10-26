import { describe, expect, it, vi } from 'vitest'
import { lookupFood } from './food-db'
import type { GoogleGenAI } from '@google/genai'

vi.mock('./food-db', () => ({ lookupFood: vi.fn(async () => null) }))
import { applyFoodDb, estimateNutrition, looksLikeMeal, MEAL_FAILED_TRACE, MEAL_OFF_REPLY, mealLine, parseJsonLoose, parseNutritionRequest, resolveMeals, shapeNutrition, withSpeculative } from './nutrition'
import type { EchoNutrition, EchoResponse } from '@/lib/echo/types'

const answer = { items: [{ name: 'Egg', quantity: '2 large', calories: 143, protein: 12.6, carbs: 1, fat: 9.5 }, { name: 'Toast', quantity: '1 slice', calories: '80' }, { name: '', calories: 10 }, { name: 'Butter', quantity: '1 tsp', calories: 'lots' }], assumptions: 'Large eggs, white bread.' }

describe('shapeNutrition', () => {
  it('validates items, sums the total and keeps the assumptions', () => {
    expect(shapeNutrition(answer, true)).toEqual({
      items: [
        { name: 'Egg', quantity: '2 large', calories: 143, protein: 12.6, carbs: 1, fat: 9.5 },
        { name: 'Toast', quantity: '1 slice', calories: 80 },
      ],
      totalCalories: 223,
      estimated: true,
      grounded: true,
      assumptions: 'Large eggs, white bread.',
    })
  })
  it('caps items and calories; null when nothing is usable', () => {
    const many = shapeNutrition({ items: Array.from({ length: 30 }, (_, i) => ({ name: `i${i}`, quantity: '', calories: 9999 })) }, false)!
    expect(many.items).toHaveLength(20)
    expect(many.items[0].calories).toBe(5000)
    expect(many.totalCalories).toBe(20000)
    expect(shapeNutrition({ items: [] }, false)).toBeNull()
    expect(shapeNutrition('nope', false)).toBeNull()
    expect(shapeNutrition({ items: [{ name: 'x', calories: 1 }], assumptions: 'a'.repeat(500) }, false)?.assumptions).toHaveLength(240)
  })
})

describe('parseJsonLoose / parseNutritionRequest', () => {
  it('reads fenced or wrapped JSON', () => {
    expect(parseJsonLoose('```json\n{"items":[]}\n```')).toEqual({ items: [] })
    expect(parseJsonLoose('Here you go: {"a":1} thanks')).toEqual({ a: 1 })
    expect(() => parseJsonLoose('no json')).toThrow(SyntaxError)
  })
  it('validates the request body', () => {
    expect(parseNutritionRequest({ description: '  two   eggs ', mealType: 'breakfast' })).toEqual({ description: 'two eggs', mealType: 'breakfast' })
    expect(parseNutritionRequest({ description: 'rice', mealType: 'brunch' })).toEqual({ description: 'rice' })
    expect(parseNutritionRequest({ description: '' })).toHaveProperty('error')
    expect(parseNutritionRequest({ description: 'x'.repeat(501) })).toHaveProperty('error')
    expect(parseNutritionRequest(null)).toHaveProperty('error')
  })
})

const fakeAi = (impl: (req: { model: string; config: { tools?: unknown[] } }) => Promise<unknown>) => {
  const generateContent = vi.fn(impl)
  return { ai: { models: { generateContent } } as unknown as GoogleGenAI, generateContent }
}
const ok = (obj: unknown) => ({ text: JSON.stringify(obj) })
const noDb = async () => null
const eggFacts = { description: 'Egg, whole, cooked, fried', kcal: 196, protein: 13.6, carbs: 0.83, fat: 14.8 }

describe('applyFoodDb', () => {
  it('computes calories and macros from per-100 g facts and the grams', async () => {
    const lookup = vi.fn(async (q: string) => (q === 'Egg, whole, fried' ? eggFacts : null))
    const raw = { items: [{ name: 'Egg', quantity: '2 large', grams: 92, lookup: 'Egg, whole, fried', calories: 180 }, { name: 'Toast', quantity: '1 slice', grams: 30, lookup: 'Bread', calories: 80 }] }
    const { raw: out, matched } = await applyFoodDb(raw, lookup)
    expect(matched).toBe(1)
    expect(shapeNutrition(out, true)?.items).toEqual([
      { name: 'Egg', quantity: '2 large', calories: 180, protein: 13, carbs: 1, fat: 14 },
      { name: 'Toast', quantity: '1 slice', calories: 80 },
    ])
  })
  it('keeps the model numbers for implausible matches, missing grams or a failed lookup', async () => {
    const raw = { items: [{ name: 'Egg', grams: 2000, lookup: 'egg', calories: 150 }, { name: 'Egg', lookup: 'egg', calories: 150 }, { name: 'Egg', grams: 50, calories: 90 }] }
    const lookup = vi.fn(async (q: string) => {
      if (q === 'Egg') throw new Error('network')
      return eggFacts
    })
    const { matched } = await applyFoodDb(raw, lookup)
    expect(matched).toBe(0)
    expect(lookup).toHaveBeenCalledTimes(2) // falls back to the name when lookup is missing; no grams = no call
    expect(await applyFoodDb('nope', lookup)).toEqual({ raw: 'nope', matched: 0 })
  })
})

describe('estimateNutrition', () => {
  it('itemises with Gemini and uses database numbers when they match', async () => {
    const { ai, generateContent } = fakeAi(async () => ok({ items: [{ name: 'Egg', quantity: '2 large', grams: 100, lookup: 'Egg, whole, fried', calories: 180 }], assumptions: 'Large eggs.' }))
    const n = await estimateNutrition(ai, { description: 'two fried eggs' }, { models: ['m1'], lookup: async () => eggFacts })
    expect(n).toMatchObject({ totalCalories: 196, grounded: true, estimated: true, assumptions: 'Large eggs.' })
    expect(generateContent).toHaveBeenCalledTimes(1)
    expect(generateContent.mock.calls[0][0].config.tools).toBeUndefined()
  })
  it('falls back to model knowledge when the database has nothing', async () => {
    const { ai } = fakeAi(async () => ok(answer))
    expect(await estimateNutrition(ai, { description: 'eggs' }, { models: ['m1'], lookup: noDb })).toMatchObject({ grounded: false, totalCalories: 223 })
  })
  it('skips the database when lookup is null and uses it by default', async () => {
    const item = { name: 'Egg', quantity: '2 large', grams: 100, lookup: 'Egg, whole, fried', calories: 180 }
    const spy = vi.mocked(lookupFood)
    spy.mockClear()
    const { ai } = fakeAi(async () => ok({ items: [item], assumptions: 'x' }))
    const n = await estimateNutrition(ai, { description: 'two fried eggs' }, { models: ['m1'], lookup: null })
    expect(n).toMatchObject({ grounded: false, totalCalories: 180 })
    expect(spy).toHaveBeenCalledTimes(0)
    await estimateNutrition(ai, { description: 'two fried eggs' }, { models: ['m1'] })
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1)
  })
  it('moves along the chain on unusable output and reports quota when every model is rate-limited', async () => {
    const { ai } = fakeAi(async (req) => (req.model === 'a' ? { text: '{"items":[]}' } : ok(answer)))
    expect((await estimateNutrition(ai, { description: 'eggs' }, { models: ['a', 'b'], lookup: noDb })).totalCalories).toBe(223)
    const quota = fakeAi(async () => {
      throw Object.assign(new Error('q'), { status: 429 })
    })
    await expect(estimateNutrition(quota.ai, { description: 'eggs' }, { models: ['a', 'b'], lookup: noDb })).rejects.toMatchObject({ kind: 'quota' })
  })
})

describe('resolveMeals', () => {
  const nutrition: EchoNutrition = { items: [{ name: 'Egg', quantity: '2', calories: 140 }], totalCalories: 540, estimated: true, grounded: false }
  const base = (actions: EchoResponse['actions']): EchoResponse => ({ reply: 'Nice start to the day!', actions, memories: [], trace: [] })
  const meal = { type: 'meal_log' as const, description: 'two eggs and toast', mealType: 'breakfast' as const, date: '2026-10-26' }
  it('attaches nutrition and leads the reply with the total', async () => {
    const out = await resolveMeals(base([meal]), true, async () => nutrition)
    expect(out.actions[0]).toEqual({ ...meal, nutrition })
    expect(out.reply).toBe('About 540 kcal — logged as breakfast. Nice start to the day!')
    expect(mealLine({ totalCalories: 1250 }, 'dinner')).toBe('About 1,250 kcal — logged as dinner.')
  })
  it('drops a meal whose estimate failed and says so', async () => {
    const out = await resolveMeals(base([meal, { type: 'reminder', title: 'x', dueAt: '2026-10-26T20:00:00+08:00' }]), true, async () => {
      throw new Error('boom')
    })
    expect(out.actions.map((a) => a.type)).toEqual(['reminder'])
    expect(out.reply).toContain("couldn't estimate the calories")
    expect(out.trace).toContain(MEAL_FAILED_TRACE)
  })
  it('skips meals when calorie tracking is off', async () => {
    const est = vi.fn()
    const out = await resolveMeals(base([meal]), false, est)
    expect(est).not.toHaveBeenCalled()
    expect(out.actions).toEqual([{ type: 'general' }])
    expect(out.reply).toContain(MEAL_OFF_REPLY)
  })
  it('re-estimates a meal_update with a new description and no stated calories', async () => {
    const out = await resolveMeals(base([{ type: 'meal_update', ref: 'm1', description: 'three eggs' }, { type: 'meal_update', ref: 'm2', totalCalories: 300 }]), true, async () => nutrition)
    expect(out.actions[0]).toMatchObject({ nutrition })
    expect(out.actions[1]).not.toHaveProperty('nutrition')
    expect(out.reply).toMatch(/^Updated: about 540 kcal\./)
  })
  it('returns the response untouched without meals', async () => {
    const r = base([{ type: 'general' }])
    expect(await resolveMeals(r, true, vi.fn())).toBe(r)
  })
})

describe('speculative estimate', () => {
  const n: EchoNutrition = { items: [{ name: 'Egg', quantity: '2', calories: 140 }], totalCalories: 140, estimated: true, grounded: false }
  it('spots meal messages', () => {
    expect(looksLikeMeal('I had two eggs and toast for breakfast')).toBe(true)
    expect(looksLikeMeal('Ate a burger')).toBe(true)
    expect(looksLikeMeal('remind me to call Mama at 8')).toBe(false)
  })
  it('reuses the speculative result once for a single meal, else estimates normally', async () => {
    const est = vi.fn(async () => ({ ...n, totalCalories: 999 }))
    const one = withSpeculative(est, Promise.resolve(n), 1)
    expect((await one('eggs')).totalCalories).toBe(140)
    expect((await one('eggs')).totalCalories).toBe(999)
    expect((await withSpeculative(est, Promise.resolve(n), 2)('eggs')).totalCalories).toBe(999)
    expect((await withSpeculative(est, Promise.resolve(null), 1)('eggs')).totalCalories).toBe(999)
    expect((await withSpeculative(est, null, 1)('eggs')).totalCalories).toBe(999)
  })
})
