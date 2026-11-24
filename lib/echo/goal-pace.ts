/** Plain-words pace and one-tap progress for the Goals page, plus the Health week line. */

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo))

/** Where the goals stand against how much of the year (or the goal's own time) has gone. More than 10 points either way counts. */
export function paceLine(progress: number, periodFraction: number): string {
  const gap = clamp(progress, 0, 100) - clamp(periodFraction, 0, 1) * 100
  if (gap < -10) return 'A bit behind the year'
  if (gap > 10) return 'Ahead of the year'
  return 'On pace'
}

// Words after a number that are amounts, not things you finish one at a time.
const NOT_ITEMS = new Set(['minute', 'minutes', 'min', 'mins', 'hour', 'hours', 'hr', 'hrs', 'km', 'kg', 'kgs', 'kilo', 'kilos', 'lb', 'lbs', 'pound', 'pounds', 'mile', 'miles', 'mi', 'step', 'steps', 'percent', 'k', 'times'])
const IRREGULAR: Record<string, string> = { movies: 'movie', cookies: 'cookie', series: 'series', people: 'person' }

function singular(word: string): string {
  const w = word.toLowerCase()
  if (IRREGULAR[w]) return IRREGULAR[w]
  if (/[^aeiou]ies$/.test(w)) return w.slice(0, -3) + 'y'
  if (/(ss|sh|ch|x)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

/** "Read 12 books" → { count: 12, item: 'book' }; null when the goal is not a count of things. */
export function countOf(title: string): { count: number; item: string } | null {
  const m = /(?<![\d.,₱$€£¥])\b(\d{1,3})\s+([a-z]+)/i.exec(title)
  if (!m) return null
  const count = Number(m[1])
  const word = m[2].toLowerCase()
  if (count < 2 || count > 365 || NOT_ITEMS.has(word)) return null
  return { count, item: singular(word) }
}

/** The one-tap progress button: "+1 book" (one item, snapped to whole items) for count-like goals, else "+ Progress" (+10). Capped at 100. */
export function progressStep(goal: { title: string; progress: number }): { label: string; next: number } {
  const p = clamp(goal.progress, 0, 100)
  const c = countOf(goal.title)
  if (!c) return { label: '+ Progress', next: Math.min(100, p + 10) }
  const done = Math.floor((p / 100) * c.count + 1e-9)
  return { label: `+1 ${c.item}`, next: Math.min(100, ((done + 1) * 100) / c.count) }
}

const dueLabel = (targetDate?: string) => {
  const m = targetDate?.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  return `due ${new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** The slim card's second line: "9 of 12", "Next: Run 8K · due Dec 20", or "42%". */
export function goalMeta(goal: { title: string; progress: number; milestones: { text: string; done: boolean }[]; targetDate?: string }): string {
  const c = countOf(goal.title)
  const next = goal.milestones.find((m) => !m.done)
  const head = c ? `${Math.floor((clamp(goal.progress, 0, 100) / 100) * c.count + 1e-9)} of ${c.count}` : next ? `Next: ${next.text}` : `${Math.round(clamp(goal.progress, 0, 100))}%`
  return [head, dueLabel(goal.targetDate)].filter(Boolean).join(' · ')
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

/** What to do next, in words: the open milestone of the goal furthest behind. */
export function nextStepLine(goals: { title: string; progress: number; milestones: { text: string; done: boolean }[] }[]): string {
  const open = goals.filter((g) => clamp(g.progress, 0, 100) < 100).sort((a, b) => a.progress - b.progress)
  if (!open.length) return 'Every goal is done. Tell Echo a new one.'
  const g = open[0]
  const next = g.milestones.find((m) => !m.done)
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
