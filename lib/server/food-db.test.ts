import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB_BACKOFF_MS, distance, factsOf, foodDbAvailable, lookupFood, resetFoodDb } from './food-db'

const hit = {
  description: 'Egg, whole, cooked, fried',
  foodNutrients: [
    { nutrientId: 1003, value: 13.6 },
    { nutrientId: 1004, value: 14.8 },
    { nutrientId: 1005, value: 0.83 },
    { nutrientId: 1008, value: 196 },
  ],
}
const res = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response

describe('factsOf', () => {
  it('reads kcal and macros per 100 g, falling back to Atwater energy', () => {
    expect(factsOf(hit)).toEqual({ description: 'Egg, whole, cooked, fried', kcal: 196, protein: 13.6, carbs: 0.83, fat: 14.8 })
    expect(factsOf({ description: 'Kale', foodNutrients: [{ nutrientId: 2047, value: 43 }] })).toEqual({ description: 'Kale', kcal: 43 })
    expect(factsOf({ description: 'Salt', foodNutrients: [] })).toBeNull()
  })
})

describe('distance', () => {
  it('prefers the hit closest to the query', () => {
    const q = 'rice, white, long-grain, cooked'
    expect(distance(q, 'Rice, white, long-grain, regular, cooked')).toBeLessThan(distance(q, 'Rice, white, cooked, glutinous'))
    expect(distance('egg, whole, fried', 'Egg, whole, cooked, fried')).toBe(1)
  })
})

describe('lookupFood', () => {
  beforeEach(() => resetFoodDb())
  it('searches generic data types, takes the first hit with energy and caches by query', async () => {
    const f = vi.fn(async () => res(200, { foods: [{ description: 'x', foodNutrients: [] }, hit] }))
    expect(await lookupFood('Egg, whole, fried', { fetch: f, apiKey: 'k' })).toMatchObject({ kcal: 196 })
    expect(await lookupFood('  egg, WHOLE, fried ', { fetch: f, apiKey: 'k' })).toMatchObject({ kcal: 196 })
    expect(f).toHaveBeenCalledTimes(1)
    const url = new URL((f.mock.calls[0] as unknown as [string])[0])
    expect(url.searchParams.get('api_key')).toBe('k')
    expect(url.searchParams.getAll('dataType')).toEqual(['Foundation', 'SR Legacy', 'Survey (FNDDS)'])
  })
  it('backs off after a rate limit and returns null on errors', async () => {
    let t = 0
    const limited = vi.fn(async () => res(429, {}))
    expect(await lookupFood('rice', { fetch: limited, now: () => t })).toBeNull()
    expect(foodDbAvailable(t + 1000)).toBe(false)
    expect(await lookupFood('bread', { fetch: limited, now: () => t + 1000 })).toBeNull()
    expect(limited).toHaveBeenCalledTimes(1)
    t = DB_BACKOFF_MS + 1
    const broken = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await lookupFood('rice', { fetch: broken, now: () => t })).toBeNull()
    expect(await lookupFood('', { fetch: broken })).toBeNull()
  })
})
