import type { MemoryType } from './types'

/** What an owner can share with an inheritor. */
export type LegacyKind = 'life' | 'goals' | 'notes' | 'diary' | 'health'

export const LEGACY_KINDS: readonly LegacyKind[] = ['life', 'goals', 'notes', 'diary', 'health']

/** Everything is shared by default except health. */
export const DEFAULT_SHARED: LegacyKind[] = ['life', 'goals', 'notes', 'diary']

/** Memory types each share kind opens. Notes and diary pages live in their own collections, not memories. */
export const MEMORY_TYPES_BY_KIND: Record<LegacyKind, MemoryType[]> = {
  life: ['person', 'interest', 'topic', 'trait', 'connector', 'task', 'diary'],
  goals: ['goal'],
  notes: [],
  diary: [],
  health: ['health'],
}

/** The memory types opened by a set of share kinds, without duplicates. */
export function memoryTypesFor(shared: LegacyKind[]): MemoryType[] {
  return [...new Set(shared.flatMap(k => MEMORY_TYPES_BY_KIND[k] ?? []))]
}

/** Preset questions. Ids are stable: never reorder or reuse one; add new ones at the end. */
export const LEGACY_QUESTIONS: readonly { id: string; text: string }[] = [
  { id: 'q1', text: 'What was the name of our first pet?' },
  { id: 'q2', text: 'What nickname did I call you?' },
  { id: 'q3', text: 'In what city did we first meet?' },
  { id: 'q4', text: 'What is my favorite food?' },
  { id: 'q5', text: 'What was my first job?' },
  { id: 'q6', text: 'What is my favorite color?' },
  { id: 'q7', text: 'What was our favorite trip destination?' },
  { id: 'q8', text: 'What is my favorite movie?' },
  { id: 'q9', text: 'What elementary school did I go to?' },
  { id: 'q10', text: 'What is my favorite song?' },
  { id: 'q11', text: 'What street did I grow up on?' },
  { id: 'q12', text: 'What did I always order at our favorite place?' },
]

export function questionText(id: string): string | null {
  return LEGACY_QUESTIONS.find(q => q.id === id)?.text ?? null
}

/** Trimmed, NFC, then toLowerCase (never toLocaleLowerCase, which differs by device locale). */
export function normalizeAnswer(raw: string): string {
  return raw.trim().normalize('NFC').toLowerCase()
}

const ANSWER_RE = /^[\p{L}\p{N}'-]{1,40}$/u

/** One word: letters, digits, apostrophe or hyphen, 1–40 chars after trimming. */
export function isValidAnswer(raw: string): boolean {
  return ANSWER_RE.test(raw.trim().normalize('NFC'))
}

export function legacyLinkId(ownerUid: string, inheritorUid: string): string {
  return `${ownerUid}_${inheritorUid}`
}

/** sha256 hex of `${linkId}:${normalized}`; hashes both the stored answer and every guess. */
export async function hashAnswer(linkId: string, raw: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${linkId}:${normalizeAnswer(raw)}`)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

export const MAX_INHERITORS = 5
export const MAX_TRIES = 5
export const TRY_WINDOW_MS = 86_400_000
export const ACTIVITY_THROTTLE_MS = 3_600_000

/** A UI month is 30 days. */
export function monthsToMinutes(months: number): number {
  return months * 30 * 1440
}

export const DEMO_MINUTES = 5
/** 24 months; the rules accept DEMO_MINUTES … MAX_RELEASE_MINUTES. */
export const MAX_RELEASE_MINUTES = 1_051_200

const RELEASE_MONTHS = [1, 2, 3, 6, 12, 18, 24]

/** Inactivity choices for the owner; demo builds get a 5 minute option first. */
export function releaseOptions(demo: boolean): { label: string; minutes: number }[] {
  const months = RELEASE_MONTHS.map(m => ({ label: m === 1 ? '1 month' : `${m} months`, minutes: monthsToMinutes(m) }))
  return demo ? [{ label: '5 minutes', minutes: DEMO_MINUTES }, ...months] : months
}

/**
 * How often lastActiveAt may be stamped: at most once per hour, but at least twice per release period,
 * so a returning owner re-locks well before a short (demo) period runs out. Unknown period: one hour.
 */
export function activityThrottleMs(releaseAfterMinutes?: number | null): number {
  if (typeof releaseAfterMinutes !== 'number' || !Number.isFinite(releaseAfterMinutes) || releaseAfterMinutes <= 0) return ACTIVITY_THROTTLE_MS
  return Math.min(ACTIVITY_THROTTLE_MS, (releaseAfterMinutes * 60_000) / 2)
}

/** lastActiveAt is stamped at most once per throttle window (one hour by default). */
export function shouldStampActivity(lastStampMs: number | null, nowMs: number, throttleMs: number = ACTIVITY_THROTTLE_MS): boolean {
  return lastStampMs === null || nowMs - lastStampMs >= throttleMs
}

export type ActivityStampDeps = {
  /** The last recorded stamp time, or null. */
  readStamp: () => number | null
  /** Records a stamp time; null clears it. */
  writeStamp: (ms: number | null) => void
  /** The Firestore write; rejects with { code: 'not-found' } when Legacy was never set up. */
  write: () => Promise<void>
  nowMs: number
  throttleMs: number
}

/**
 * One throttled activity stamp. The time is recorded before the write so overlapping calls (open + focus)
 * write once; a failed write rolls it back so the next call retries. A missing settings doc keeps the
 * stamp: there is nothing to keep alive until the owner turns Legacy on (which stamps by itself).
 */
export async function runActivityStamp(d: ActivityStampDeps): Promise<'skipped' | 'stamped' | 'missing' | 'failed'> {
  const prev = d.readStamp()
  if (!shouldStampActivity(prev, d.nowMs, d.throttleMs)) return 'skipped'
  d.writeStamp(d.nowMs)
  try {
    await d.write()
    return 'stamped'
  } catch (e) {
    if ((e as { code?: string } | null)?.code === 'not-found') return 'missing'
    d.writeStamp(prev)
    return 'failed'
  }
}
