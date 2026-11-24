/** Plain-words pace for the Goals page, plus the Health week line. Goal progress itself comes from goal-progress.ts. */

import { goalProgress, subgoalLine, type GoalProgressLike } from './goal-progress'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))

/** Where the goals stand against how much of the year (or the goal's own time) has gone. More than 10 points either way counts. */
export function paceLine(progress: number, periodFraction: number): string {
  const gap = clamp(progress, 0, 100) - clamp(periodFraction, 0, 1) * 100
  if (gap < -10) return 'A bit behind the year'
  if (gap > 10) return 'Ahead of the year'
  return 'On pace'
}

const dueLabel = (targetDate?: string) => {
  const m = targetDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `due ${new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** The slim card's second line: "2 of 3 sub-goals · due Dec 20", "Not done yet" or "Done". */
export function goalMeta(goal: GoalProgressLike & { targetDate?: string }): string {
  return [subgoalLine(goal), dueLabel(goal.targetDate)].filter(Boolean).join(' · ')
}

/** How much of the local calendar year has gone (0..1). */
export function yearFraction(nowMs: number): number {
  const y = new Date(nowMs).getFullYear()
  const start = new Date(y, 0, 1).getTime()
  return clamp((nowMs - start) / (new Date(y + 1, 0, 1).getTime() - start), 0, 1)
}

/** How much of a goal's time has gone: creation → end of the target day, or the year without a target. */
export function goalFraction(goal: { createdMs: number | null; targetDate?: string }, nowMs: number): number {
  const m = goal.targetDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m || goal.createdMs == null) return yearFraction(nowMs)
  const end = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime()
  if (end <= goal.createdMs) return 1
  return clamp((nowMs - goal.createdMs) / (end - goal.createdMs), 0, 1)
}

/** What to do next, in words: the open sub-goal of the goal furthest behind. */
export function nextStepLine(goals: (GoalProgressLike & { title: string; milestones: { text: string; done: boolean }[] })[]): string {
  const open = goals.map((g) => ({ g, p: goalProgress(g) })).filter((x) => x.p < 100).sort((a, b) => a.p - b.p)
  if (!open.length) return 'Every goal is done. Tell Echo a new one.'
  const g = open[0].g
  const next = g.milestones.find((m) => !m.done && m.text?.trim())
  return next ? `Next: ${next.text}, for ${g.title}.` : `Give “${g.title}” a small push today.`
}

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => typeof x === 'number')
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null
}

/** One sentence under the water week chart, comparing logged-day averages with the week before. */
export function waterWeekLine(thisWeek: (number | null)[], lastWeek: (number | null)[]): string {
  const now = avg(thisWeek)
  if (now === null) return 'No water logged this week yet.'
  const before = avg(lastWeek)
  if (!before) return `About ${Math.round(now * 10) / 10} glasses a day.`
  const pct = Math.round(((now - before) / before) * 100)
  if (Math.abs(pct) < 5) return 'About the same as last week.'
  return pct > 0 ? `Up ${pct}% on last week.` : `Down ${-pct}% on last week.`
}
