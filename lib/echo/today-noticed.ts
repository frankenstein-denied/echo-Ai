// "Echo noticed" on the Today tab: one short line from local rules only (no AI call), or null to hide the card.
import { timeChipLabel } from './glow'

export type NoticedInput = {
  nowMs: number
  waterGlasses: number
  waterGoal: number
  /** The next not-done reminder's due time, if any. */
  nextReminderDueMs?: number
  nextReminderTitle?: string
  /** Bedtime, HH:MM (may be after midnight). */
  sleepStart: string
  /** Wake time, HH:MM. Defaults to 07:00. */
  sleepEnd?: string
}

/** `send` is the sentence for Echo; `direct: 'water'` means the app can save it itself (+1 glass) without asking Echo. */
export type Noticed = { text: string; action?: { label: string; send: string; direct?: 'water' } }

const SOON_MS = 30 * 60_000
const NOON = 12 * 60
const DAY = 24 * 60

function minutesOf(hhmm: string | undefined, fallback: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '')
  if (!m) return fallback
  const v = Number(m[1]) * 60 + Number(m[2])
  return v >= 0 && v < DAY ? v : fallback
}

/** Glasses that would be on pace by now: the goal spread evenly over the waking day, or null outside waking hours. */
function waterOnPace(nowMs: number, goal: number, sleepStart: string, sleepEnd?: string): { expected: number; minute: number } | null {
  const d = new Date(nowMs)
  const wake = minutesOf(sleepEnd, 7 * 60)
  let bed = minutesOf(sleepStart, 22 * 60)
  if (bed <= wake) bed += DAY // bedtime after midnight
  let now = d.getHours() * 60 + d.getMinutes()
  if (now < wake) now += DAY // small hours belong to the day before
  if (now >= bed) return null // asleep
  return { expected: Math.floor((goal * (now - wake)) / (bed - wake)), minute: now }
}

export function noticed(input: NoticedInput): Noticed | null {
  const { nowMs, nextReminderDueMs } = input
  if (nextReminderDueMs !== undefined && nextReminderDueMs >= nowMs && nextReminderDueMs - nowMs <= SOON_MS) {
    const mins = Math.max(1, Math.round((nextReminderDueMs - nowMs) / 60_000))
    const what = input.nextReminderTitle?.trim() ? `"${input.nextReminderTitle.trim()}"` : 'A reminder'
    return { text: `${what} is due in ${mins} min.` }
  }

  const goal = Math.max(1, Math.round(input.waterGoal))
  const glasses = Math.max(0, input.waterGlasses)
  const pace = glasses < goal ? waterOnPace(nowMs, goal, input.sleepStart, input.sleepEnd) : null
  if (pace && pace.minute >= NOON && pace.expected - glasses >= 2) {
    return {
      text: `You've had ${glasses} of ${goal} glasses of water so far today. A glass now keeps you on track.`,
      action: { label: '+1 glass', send: 'I just drank a glass of water', direct: 'water' },
    }
  }
  return null
}

/** "Up next" time for a reminder: "Overdue", "Now", "in 15 min" within the hour, else a time ("6:00 PM", "Tomorrow 9:00 AM"). */
export function dueLabel(dueMs: number, nowMs: number): string {
  const diff = dueMs - nowMs
  if (diff < -60_000) return 'Overdue'
  if (diff < 60_000) return 'Now'
  if (diff < 60 * 60_000) return `in ${Math.round(diff / 60_000)} min`
  return timeChipLabel(new Date(dueMs), new Date(nowMs))
}
