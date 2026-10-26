// Nutrition facts per 100 g from USDA FoodData Central (free; key from https://fdc.nal.usda.gov/api-key-signup,
// set USDA_API_KEY). Only generic data types are searched (Foundation, SR Legacy, Survey/FNDDS), whose search
// results report nutrients per 100 g. Lookups never throw: any failure returns null and the caller keeps the
// model's estimate.

export type FoodFacts = { description: string; kcal: number; protein?: number; carbs?: number; fat?: number }

const SEARCH_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search'
const DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)']
const NUTRIENT = { kcal: 1008, kcalAtwaterGeneral: 2047, kcalAtwaterSpecific: 2048, protein: 1003, fat: 1004, carbs: 1005 }
export const LOOKUP_TIMEOUT_MS = 2500
/** After a 429/403 from the API, skip lookups for this long. */
export const DB_BACKOFF_MS = 10 * 60e3
const CACHE_MAX = 500

const cache = new Map<string, FoodFacts | null>()
let offUntil = 0

/** Test hook. */
export function resetFoodDb(): void {
  cache.clear()
  offUntil = 0
}

type Nutrient = { nutrientId?: number; value?: number; unitName?: string }
type Food = { description?: string; foodNutrients?: Nutrient[] }

/** Per-100 g facts from one search hit; null when it has no energy value. */
export function factsOf(food: Food): FoodFacts | null {
  const list = Array.isArray(food.foodNutrients) ? food.foodNutrients : []
  const val = (id: number) => {
    const n = list.find((x) => x.nutrientId === id)
    return n && typeof n.value === 'number' && Number.isFinite(n.value) && n.value >= 0 ? n.value : undefined
  }
  // Foundation foods often carry only the Atwater energy values.
  const kcal = val(NUTRIENT.kcal) ?? val(NUTRIENT.kcalAtwaterSpecific) ?? val(NUTRIENT.kcalAtwaterGeneral)
  if (kcal === undefined || typeof food.description !== 'string') return null
  const out: FoodFacts = { description: food.description, kcal }
  const protein = val(NUTRIENT.protein)
  const carbs = val(NUTRIENT.carbs)
  const fat = val(NUTRIENT.fat)
  if (protein !== undefined) out.protein = protein
  if (carbs !== undefined) out.carbs = carbs
  if (fat !== undefined) out.fat = fat
  return out
}

const words = (t: string) => t.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

/**
 * How far a hit's name is from the query: extra words, plus a penalty per missing query word. The search ranks
 * "Rice, white, cooked, glutinous" above plain cooked rice, so the closest name wins (ties keep search order).
 */
export function distance(query: string, description: string): number {
  const q = new Set(words(query))
  const d = new Set(words(description))
  let n = 0
  for (const w of d) if (!q.has(w)) n++
  for (const w of q) if (!d.has(w)) n += 3
  return n
}

export function foodDbAvailable(now = Date.now()): boolean {
  return now >= offUntil
}

/** Best generic match for a food name, per 100 g; null when not found or the database is unreachable. */
export async function lookupFood(
  query: string,
  opts: { fetch?: typeof fetch; apiKey?: string; now?: () => number; timeoutMs?: number } = {},
): Promise<FoodFacts | null> {
  const q = query.replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100)
  if (!q) return null
  if (cache.has(q)) return cache.get(q) ?? null
  const now = opts.now ?? Date.now
  if (!foodDbAvailable(now())) return null
  const doFetch = opts.fetch ?? fetch
  const apiKey = opts.apiKey ?? (process.env.USDA_API_KEY || 'DEMO_KEY')
  const params = new URLSearchParams({ api_key: apiKey, query: q, pageSize: '5' })
  for (const t of DATA_TYPES) params.append('dataType', t)
  try {
    const r = await doFetch(`${SEARCH_URL}?${params}`, { signal: AbortSignal.timeout(opts.timeoutMs ?? LOOKUP_TIMEOUT_MS) })
    if (r.status === 429 || r.status === 403) {
      offUntil = now() + DB_BACKOFF_MS
      return null
    }
    if (!r.ok) return null
    const data = (await r.json()) as { foods?: Food[] }
    const foods = Array.isArray(data.foods) ? data.foods : []
    let facts: FoodFacts | null = null
    let best = Infinity
    for (const f of foods) {
      const ff = factsOf(f)
      const d = ff ? distance(q, ff.description) : Infinity
      if (d < best) [facts, best] = [ff, d]
    }
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string)
    cache.set(q, facts)
    return facts
  } catch {
    return null // timeout, network or bad JSON: not cached, so a later meal can retry
  }
}
