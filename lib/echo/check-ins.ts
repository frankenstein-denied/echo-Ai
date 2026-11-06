import type { UserProfile } from '@/lib/firestore'

// Type-only import of lib/firestore: that file imports this one, and this one must run in pure tests.
export const MIN_GAP_MINUTES = 5
export const MAX_GAP_MINUTES = 43200 // 30 days, same limits as firestore.rules and the native FirestoreJson
export const DEFAULT_WATER_GOAL = 8
export const MIN_WATER_GOAL = 1
export const MAX_WATER_GOAL = 30

const DEFAULT_EVERY_MINUTES = 120
const DEFAULT_SLEEP_START = '22:00'
const DEFAULT_SLEEP_END = '07:00'
const TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/ // same pattern as firestore.rules

export type GapUnit = 'minutes' | 'hours' | 'days'
const UNIT_MINUTES: Record<GapUnit, number> = { minutes: 1, hours: 60, days: 1440 }

export type CheckInSettings = { enabled: boolean; everyMinutes: number; sleepStart: string; sleepEnd: string; waterGoal: number }

const validTime = (t: unknown, fallback: string) => (typeof t === 'string' && TIME_RE.test(t) ? t : fallback)
const isWaterGoal = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= MIN_WATER_GOAL && n <= MAX_WATER_GOAL
const validWaterGoal = (n: unknown) => (isWaterGoal(n) ? n : DEFAULT_WATER_GOAL)

const isGap = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= MIN_GAP_MINUTES && n <= MAX_GAP_MINUTES

/** A stored gap in the largest unit that keeps it a whole number. */
export function gapParts(minutes: number): { value: number; unit: GapUnit } {
  const unit: GapUnit = minutes % UNIT_MINUTES.days === 0 ? 'days' : minutes % UNIT_MINUTES.hours === 0 ? 'hours' : 'minutes'
  return { value: minutes / UNIT_MINUTES[unit], unit }
}

export function gapMinutes(value: number, unit: GapUnit): number {
  return value * UNIT_MINUTES[unit]
}

/** The typed gap in minutes, or null unless it is a whole positive number inside the allowed range. */
export function parseGap(raw: string, unit: GapUnit): number | null {
  const t = raw.trim()
  if (!/^\d+$/.test(t)) return null
  const minutes = gapMinutes(Number(t), unit)
  return isGap(minutes) ? minutes : null
}

/** The typed water target, or null unless it is a whole number in range. */
export function parseWaterGoal(raw: string): number | null {
  const t = raw.trim()
  const n = /^\d+$/.test(t) ? Number(t) : null
  return isWaterGoal(n) ? n : null
}

/** The one-time "Display over other apps" explanation: only in the full Android app, after onboarding, and never twice. */
export function shouldPromptOverlay(s: { isNative: boolean; embed: boolean; onboarded: boolean; enabled: boolean; overlayAllowed: boolean; asked: boolean }): boolean {
  return s.isNative && !s.embed && s.onboarded && s.enabled && !s.overlayAllowed && !s.asked
}

/** The muted Settings line about the bubble, or null on an older APK that doesn't report it. */
export function bubbleStatusLine(s: { bubbleRunning?: boolean; bubbleError?: string | null }): string | null {
  if (s.bubbleRunning === undefined) return null
  if (s.bubbleError) return `Bubble isn't running (${s.bubbleError})`
  return s.bubbleRunning ? 'Bubble: on' : "Bubble isn't running"
}

// Absent or bad fields read as the defaults. An absent switch reads as on, unless onboarding said no to reminders.
export function resolveCheckInSettings(
  p: Partial<Pick<UserProfile, 'checkInsEnabled' | 'checkInEveryMinutes' | 'sleepStart' | 'sleepEnd' | 'waterGoal' | 'remindersEnabled'>>,
): CheckInSettings {
  return {
    enabled: typeof p.checkInsEnabled === 'boolean' ? p.checkInsEnabled : p.remindersEnabled !== false,
    everyMinutes: isGap(p.checkInEveryMinutes) ? p.checkInEveryMinutes : DEFAULT_EVERY_MINUTES,
    sleepStart: validTime(p.sleepStart, DEFAULT_SLEEP_START),
    sleepEnd: validTime(p.sleepEnd, DEFAULT_SLEEP_END),
    waterGoal: validWaterGoal(p.waterGoal),
  }
}
