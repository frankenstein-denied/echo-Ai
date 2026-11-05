import type { Milestone } from '@/lib/firestore'
import { weekStartMs } from './sidebar'

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

export function yearProgress(now: Date): number {
  const start = new Date(now.getFullYear(), 0, 1)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dayOfYear = Math.round((today.getTime() - start.getTime()) / 86_400_000) + 1
  const daysInYear = Math.round((new Date(now.getFullYear() + 1, 0, 1).getTime() - start.getTime()) / 86_400_000)
  return Math.round((dayOfYear / daysInYear) * 100)
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
