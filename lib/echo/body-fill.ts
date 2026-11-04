/** Fill levels and captions for the Health body silhouettes. */

export const WATER_TARGET = 8
/** Without a calorie goal, the calories body is lit against a neutral 2,000 kcal day. */
export const NO_GOAL_KCAL_SCALE = 2000

const clamp01 = (n: number) => Math.min(1, Math.max(0, n))
const safe = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0)
// Glasses keep one decimal so a week's average reads "5.5"; kcal are whole numbers.
const glasses = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })
const kcalNum = (n: number) => Math.round(n).toLocaleString('en-US')

export function waterFill(glassCount: number): { level: number; full: boolean; text: string; sub: string } {
  const g = safe(glassCount)
  const full = g >= WATER_TARGET
  return {
    level: clamp01(g / WATER_TARGET),
    full,
    text: `${glasses(g)} / ${WATER_TARGET} glasses`,
    sub: full ? 'goal reached' : `${glasses(WATER_TARGET - g)} to go`,
  }
}

export function calorieFill(kcal: number, goal: number | undefined): { level: number; over: boolean; noGoal: boolean; text: string; sub: string } {
  const k = Math.round(safe(kcal))
  if (!goal || !Number.isFinite(goal) || goal <= 0) {
    return { level: clamp01(k / NO_GOAL_KCAL_SCALE), over: false, noGoal: true, text: `${kcalNum(k)} kcal today`, sub: '' }
  }
  const g = Math.round(goal)
  const over = k > g
  return {
    level: clamp01(k / g),
    over,
    noGoal: false,
    text: `${kcalNum(k)} of ${kcalNum(g)} kcal`,
    sub: over ? `${kcalNum(k - g)} over` : `${kcalNum(g - k)} left`,
  }
}

/** Mean of the finite values (days with no log are skipped), or null when nothing was logged. */
export function averageLogged(values: (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => typeof x === 'number' && Number.isFinite(x))
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}
