import type { UserProfile } from '@/lib/firestore'

// Type-only import of lib/firestore: that file imports this one, and this one must run in pure tests.
export const CHECK_IN_GAPS: readonly number[] = [30, 60, 120, 180, 240, 360]
export const DEFAULT_WATER_GOAL = 8
export const MIN_WATER_GOAL = 1
export const MAX_WATER_GOAL = 30

const DEFAULT_EVERY_MINUTES = 120
const DEFAULT_SLEEP_START = '22:00'
const DEFAULT_SLEEP_END = '07:00'
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/ // same pattern as firestore.rules

export type CheckInSettings = { enabled: boolean; everyMinutes: number; sleepStart: string; sleepEnd: string; waterGoal: number }

const validTime = (t: unknown, fallback: string) => (typeof t === 'string' && TIME_RE.test(t) ? t : fallback)
const isWaterGoal = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= MIN_WATER_GOAL && n <= MAX_WATER_GOAL
const validWaterGoal = (n: unknown) => (isWaterGoal(n) ? n : DEFAULT_WATER_GOAL)

/** The typed water target, or null unless it is a whole number in range. */
export function parseWaterGoal(raw: string): number | null {
  const t = raw.trim()
  const n = /^\d+$/.test(t) ? Number(t) : null
  return isWaterGoal(n) ? n : null
}

// Absent or bad fields read as the defaults. An absent switch reads as on, unless onboarding said no to reminders.
export function resolveCheckInSettings(
  p: Partial<Pick<UserProfile, 'checkInsEnabled' | 'checkInEveryMinutes' | 'sleepStart' | 'sleepEnd' | 'waterGoal' | 'remindersEnabled'>>,
): CheckInSettings {
  return {
    enabled: typeof p.checkInsEnabled === 'boolean' ? p.checkInsEnabled : p.remindersEnabled !== false,
    everyMinutes: typeof p.checkInEveryMinutes === 'number' && CHECK_IN_GAPS.includes(p.checkInEveryMinutes) ? p.checkInEveryMinutes : DEFAULT_EVERY_MINUTES,
    sleepStart: validTime(p.sleepStart, DEFAULT_SLEEP_START),
    sleepEnd: validTime(p.sleepEnd, DEFAULT_SLEEP_END),
    waterGoal: validWaterGoal(p.waterGoal),
  }
}
