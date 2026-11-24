/**
 * Goal progress, one rule everywhere:
 * - With at least MIN_SUBGOALS sub-goals (stored as `milestones`), progress is done ÷ total, equal shares, rounded.
 * - With fewer (none, or a single one), the goal is simply done (100) or not done (0).
 * The stored `progress` field is always written with this derived value so other readers
 * (the Android notification, check-ins, Legacy) stay correct.
 */

export const MIN_SUBGOALS = 2

type SubgoalLike = { text?: string; done?: boolean }
export type GoalProgressLike = { progress?: number; milestones?: SubgoalLike[] | null }

/** The sub-goals that count: entries with non-empty text. */
function counted(g: GoalProgressLike): SubgoalLike[] {
  const list = Array.isArray(g.milestones) ? g.milestones : []
  return list.filter((m): m is SubgoalLike => !!m && typeof m === 'object' && typeof m.text === 'string' && m.text.trim() !== '')
}

export function subgoalCount(g: GoalProgressLike): { done: number; total: number } {
  const list = counted(g)
  return { done: list.filter((m) => m.done === true).length, total: list.length }
}

/** True when the goal has enough sub-goals (≥ MIN_SUBGOALS) for automatic progress. */
export function hasSubgoals(g: GoalProgressLike): boolean {
  return counted(g).length >= MIN_SUBGOALS
}

/** Whole-percent progress, 0..100: from sub-goals when there are enough, else done (100) or not done (0). */
export function goalProgress(g: GoalProgressLike): number {
  const { done, total } = subgoalCount(g)
  if (total >= MIN_SUBGOALS) return Math.round((done / total) * 100)
  return typeof g.progress === 'number' && Number.isFinite(g.progress) && g.progress >= 100 ? 100 : 0
}

export function isGoalDone(g: GoalProgressLike): boolean {
  return goalProgress(g) >= 100
}

/** The goal card's short status: "1 of 3 sub-goals", "Done" or "Not done yet". */
export function subgoalLine(g: GoalProgressLike): string {
  const { done, total } = subgoalCount(g)
  if (total >= MIN_SUBGOALS) return `${done} of ${total} sub-goals`
  return isGoalDone(g) ? 'Done' : 'Not done yet'
}

/**
 * The fields to write for a goal change: the new milestones (when given) plus the derived progress.
 * `change.progress` is a requested done state for a goal without sub-goals (≥ 100 = done, else not done);
 * with sub-goals it is ignored. Without a request, the goal's current derived state carries over.
 */
export function goalWrite<M extends SubgoalLike>(
  current: GoalProgressLike,
  change: { milestones?: M[]; progress?: number },
): { milestones?: M[]; progress: number } {
  const base = change.progress !== undefined ? change.progress : goalProgress(current)
  const milestones = change.milestones ?? current.milestones
  const progress = goalProgress({ progress: base, milestones })
  return change.milestones ? { milestones: change.milestones, progress } : { progress }
}

/** Goals whose stored `progress` differs from the derived value, with the value to store (one-time normalization). */
export function progressFixes<G extends GoalProgressLike & { id: string }>(goals: G[]): { id: string; progress: number }[] {
  const out: { id: string; progress: number }[] = []
  for (const g of goals) {
    const progress = goalProgress(g)
    if (g.progress !== progress) out.push({ id: g.id, progress })
  }
  return out
}
