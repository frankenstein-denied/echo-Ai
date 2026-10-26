// Pure helpers for mood tags and meals (no Firebase imports so they are unit-testable and reusable by the Echo router).

export const MOOD_TAGS = ['great', 'happy', 'okay', 'tired', 'sad', 'anxious', 'angry'] as const
export type MoodTag = (typeof MOOD_TAGS)[number]

export const MOOD_SCORES: Record<MoodTag, number> = { great: 9, happy: 8, okay: 6, tired: 4, sad: 3, anxious: 3, angry: 2 }
export const MOOD_LABELS: Record<MoodTag, string> = { great: 'Great', happy: 'Happy', okay: 'Okay', tired: 'Tired', sad: 'Sad', anxious: 'Anxious', angry: 'Angry' }

export function isMoodTag(v: unknown): v is MoodTag {
  return typeof v === 'string' && (MOOD_TAGS as readonly string[]).includes(v)
}

export function moodScore(tag: MoodTag): number {
  return MOOD_SCORES[tag]
}

// Nearest tag for a legacy 1-10 score; ties go to the earlier (more positive) tag. Null for missing/invalid scores.
export function moodFromScore(score: unknown): MoodTag | null {
  if (typeof score !== 'number' || !Number.isFinite(score)) return null
  let best: MoodTag = MOOD_TAGS[0]
  let bestDist = Infinity
  for (const tag of MOOD_TAGS) {
    const dist = Math.abs(MOOD_SCORES[tag] - score)
    if (dist < bestDist) {
      best = tag
      bestDist = dist
    }
  }
  return best
}

// Display tag for a health log: the stored tag, else the nearest tag to the legacy score.
export function moodTagOf(log: { moodTag?: unknown; mood?: unknown } | null | undefined): MoodTag | null {
  if (!log) return null
  return isMoodTag(log.moodTag) ? log.moodTag : moodFromScore(log.mood)
}

// ---------- meals ----------
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]
export type MealSource = 'chat' | 'call' | 'manual'
export type MealItem = { name: string; quantity: string; calories: number; protein?: number; carbs?: number; fat?: number }
export const MEAL_TYPE_LABELS: Record<MealType, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' }

export const LIMITS = { description: 500, items: 20, name: 120, quantity: 60, itemCalories: 5000, macro: 500, total: 20000, goalMin: 800, goalMax: 6000 }

export function isMealType(v: unknown): v is MealType {
  return typeof v === 'string' && (MEAL_TYPES as readonly string[]).includes(v)
}

const clampInt = (v: unknown, lo: number, hi: number): number | null => {
  const n = typeof v === 'string' ? Number(v.trim() === '' ? NaN : v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return null
  return Math.min(hi, Math.max(lo, Math.round(n)))
}

const optMacro = (v: unknown): number | undefined => {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'string' ? Number(v) : v
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return Math.min(LIMITS.macro, Math.max(0, Math.round(n * 10) / 10))
}

// Trims, clamps and drops unusable items (empty name or non-numeric calories); caps at 20. Never returns undefined fields.
export function sanitizeItems(items: unknown): MealItem[] {
  if (!Array.isArray(items)) return []
  const out: MealItem[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const name = typeof r.name === 'string' ? r.name.trim().slice(0, LIMITS.name) : ''
    const calories = clampInt(r.calories, 0, LIMITS.itemCalories)
    if (!name || calories === null) continue
    const item: MealItem = { name, quantity: typeof r.quantity === 'string' ? r.quantity.trim().slice(0, LIMITS.quantity) : '', calories }
    const protein = optMacro(r.protein)
    const carbs = optMacro(r.carbs)
    const fat = optMacro(r.fat)
    if (protein !== undefined) item.protein = protein
    if (carbs !== undefined) item.carbs = carbs
    if (fat !== undefined) item.fat = fat
    out.push(item)
    if (out.length >= LIMITS.items) break
  }
  return out
}

export function itemsTotal(items: { calories: number }[]): number {
  return items.reduce((sum, i) => sum + i.calories, 0)
}

export type MealInput = { date: string; mealType: MealType; description: string; items: MealItem[]; totalCalories: number; source: MealSource; estimated: boolean }
export type MealCheck = { ok: true; value: MealInput } | { ok: false; error: string }

// Validates and normalises a meal. With items the total is their sum; without items `totalCalories` is required.
export function validateMeal(input: { date?: unknown; mealType?: unknown; description?: unknown; items?: unknown; totalCalories?: unknown; source?: unknown; estimated?: unknown }): MealCheck {
  if (typeof input.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: 'Pick a valid date.' }
  if (!isMealType(input.mealType)) return { ok: false, error: 'Pick a meal type.' }
  const source: MealSource = input.source === 'chat' || input.source === 'call' ? input.source : 'manual'
  const items = sanitizeItems(input.items)
  let description = typeof input.description === 'string' ? input.description.trim().slice(0, LIMITS.description) : ''
  if (!description && items.length) description = items.map((i) => i.name).join(', ').slice(0, LIMITS.description)
  if (!description) return { ok: false, error: 'Describe what you ate.' }
  const total = items.length ? itemsTotal(items) : clampInt(input.totalCalories, 0, LIMITS.total)
  if (total === null) return { ok: false, error: 'Enter the calories.' }
  if (total > LIMITS.total) return { ok: false, error: `Calories can be at most ${LIMITS.total}.` }
  return { ok: true, value: { date: input.date, mealType: input.mealType, description, items, totalCalories: total, source, estimated: input.estimated === true } }
}

export function dailyTotals(meals: { date: string; totalCalories: number }[], dates: string[]): { date: string; calories: number }[] {
  const sums = new Map<string, number>()
  for (const m of meals) sums.set(m.date, (sums.get(m.date) ?? 0) + (m.totalCalories || 0))
  return dates.map((date) => ({ date, calories: sums.get(date) ?? 0 }))
}

export type GoalProgress = { pct: number; remaining: number; over: number }
// pct is clamped to 0-100 for the bar; remaining is 0 once the goal is reached, over is the excess.
export function goalProgress(total: number, goal: number | undefined | null): GoalProgress | null {
  if (typeof goal !== 'number' || !(goal > 0)) return null
  const t = Math.max(0, total)
  return { pct: Math.min(100, Math.round((t / goal) * 100)), remaining: Math.max(0, goal - t), over: Math.max(0, t - goal) }
}

export function groupByMealType<T extends { mealType: MealType }>(meals: T[]): { type: MealType; meals: T[] }[] {
  return MEAL_TYPES.map((type) => ({ type, meals: meals.filter((m) => m.mealType === type) })).filter((g) => g.meals.length)
}

// '' clears the goal (undefined); a number outside 800-6000 or non-integer text is invalid (null).
export function parseCalorieGoal(raw: string): number | undefined | null {
  const t = raw.trim()
  if (!t) return undefined
  if (!/^\d+$/.test(t)) return null
  const n = Number(t)
  return n >= LIMITS.goalMin && n <= LIMITS.goalMax ? n : null
}

export type HealthWeekPoint = { date: string; label: string; mood: number | null; moodTag: MoodTag | null; calories: number }
