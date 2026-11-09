import type { Milestone } from '@/lib/firestore'
import { weekStartMs } from './sidebar'
import type { Period } from './period'

/** Builds a milestone with the given done state; doneAt is only present when done (Firestore rejects undefined). */
export function withDone(m: Milestone, done: boolean, nowMs: number): Milestone {
  const { doneAt: _drop, ...rest } = m
  void _drop
  return done ? { ...rest, done: true, doneAt: nowMs } : { ...rest, done: false }
}

export function toggleMilestone(list: Milestone[], i: number, nowMs: number): Milestone[] {
  return list.map((m, idx) => (idx === i ? withDone(m, !m.done, nowMs) : m))
}

export function overallProgress(goals: { progress: number }[]): number {
  if (!goals.length) return 0
  const sum = goals.reduce((s, g) => s + (Number.isFinite(g.progress) ? Math.min(100, Math.max(0, g.progress)) : 0), 0)
  return Math.round(sum / goals.length)
}

const PERIOD_WORD: Record<Period, string> = { today: 'today', week: 'this week', month: 'this month', year: 'this year', all: 'this year' }

/** How the period reads in "x% of {word} gone". 'all' is measured against the year. */
export function periodWord(period: Period): string {
  return PERIOD_WORD[period]
}

/** One plain line comparing goal progress to how much of the period has passed (more than 10 points either way counts). */
export function paceLine(goalsPct: number, elapsedPct: number, period: Period, goalCount: number): string {
  if (goalCount === 0) return 'No goals in this period yet.'
  const pace =
    goalsPct < elapsedPct - 10 ? 'A bit behind, one small step today helps.'
    : goalsPct > elapsedPct + 10 ? "You're ahead, nice!"
    : "You're on track."
  return `${goalsPct}% done, ${elapsedPct}% of ${periodWord(period)} gone. ${pace}`
}

export function milestonesDoneThisWeek(goals: { milestones?: Milestone[] }[], now: Date): number {
  const from = weekStartMs(now)
  let n = 0
  for (const g of goals) for (const m of g.milestones ?? []) if (m.done && typeof m.doneAt === 'number' && m.doneAt >= from) n++
  return n
}

export function milestonePath(list: Milestone[], max = 10): { steps: { text: string; index: number; state: 'done' | 'next' | 'todo' }[]; more: number } {
  const next = list.findIndex((m) => !m.done)
  const steps = list.slice(0, max).map((m, index) => ({ text: m.text, index, state: m.done ? ('done' as const) : index === next ? ('next' as const) : ('todo' as const) }))
  return { steps, more: Math.max(0, list.length - steps.length) }
}
