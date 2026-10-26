// Pure helpers for the Notes / Goals / Reminders / Health views (no Firebase imports so they are unit-testable).

export type Debounced<A extends unknown[]> = ((...args: A) => void) & { flush: () => void; cancel: () => void }

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: A | null = null
  const run = () => {
    timer = null
    if (!pending) return
    const args = pending
    pending = null
    fn(...args)
  }
  const d = ((...args: A) => {
    pending = args
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, ms)
  }) as Debounced<A>
  d.flush = () => {
    if (timer) clearTimeout(timer)
    run()
  }
  d.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
    pending = null
  }
  return d
}

export function splitReminders<T extends { dueMs: number; done: boolean }>(items: T[]): { upcoming: T[]; done: T[] } {
  const upcoming = items.filter((r) => !r.done).sort((a, b) => a.dueMs - b.dueMs)
  const done = items.filter((r) => r.done).sort((a, b) => b.dueMs - a.dueMs)
  return { upcoming, done }
}

export function filterNotes<T extends { title: string; body: string; tags: string[] }>(notes: T[], term: string): T[] {
  const q = term.trim().toLowerCase()
  if (!q) return notes
  return notes.filter((n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q)))
}

export function parseTags(raw: string): string[] {
  const out: string[] = []
  for (const t of raw.split(/[,\n]/)) {
    const tag = t.trim().replace(/^#/, '').slice(0, 40)
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return out.slice(0, 20)
}

export function localDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type WeekPoint = { date: string; label: string; mood: number | null }

// Last 7 local days ending at `today` (YYYY-MM-DD), oldest first; missing days have mood null.
export function lastSevenDays(today: string, logs: { date: string; mood?: number }[]): WeekPoint[] {
  const [y, m, d] = today.split('-').map(Number)
  const byDate = new Map(logs.map((l) => [l.date, l.mood]))
  const out: WeekPoint[] = []
  for (let i = 6; i >= 0; i--) {
    const day = new Date(y, m - 1, d - i)
    const key = localDateKey(day)
    const mood = byDate.get(key)
    out.push({ date: key, label: day.toLocaleDateString('en-US', { weekday: 'short' }), mood: typeof mood === 'number' ? mood : null })
  }
  return out
}

export function splitSleep(minutes: number | undefined): { hours: number; minutes: number } {
  const total = Math.max(0, Math.round(minutes ?? 0))
  return { hours: Math.floor(total / 60), minutes: total % 60 }
}

export function areaShares(goals: { category: string }[]): { category: string; count: number; pct: number }[] {
  const counts = new Map<string, number>()
  for (const g of goals) counts.set(g.category, (counts.get(g.category) ?? 0) + 1)
  return [...counts.entries()].map(([category, count]) => ({ category, count, pct: Math.round((count / goals.length) * 100) }))
}

// Sleep inputs are strings so they can be cleared. Returns minutes, or null when nothing should be saved yet:
// hours must be a valid whole number; empty minutes count as 0 only when hours is set.
export function parseSleepInput(hours: string, minutes: string): number | null {
  const h = hours.trim()
  const m = minutes.trim()
  if (h === '' || !/^\d+$/.test(h)) return null
  if (m !== '' && !/^\d+$/.test(m)) return null
  const hh = Number(h)
  const mm = m === '' ? 0 : Number(m)
  if (hh > 24 || mm > 59) return null
  return hh * 60 + mm
}

// Water stepper: never below 0 or above 30.
export function stepWater(current: number, delta: number): number {
  return Math.min(30, Math.max(0, current + delta))
}

export type Source = { title: string; url: string }

/** The normalized href of an http(s) URL; anything else (javascript:, data:, relative, junk) is null. */
export function safeSourceUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null
  } catch {
    return null
  }
}

/** At most 5 safe sources with trimmed titles (<= 200) and urls (<= 500); unsafe or over-long urls are dropped. */
export function sanitizeSources(sources: readonly Source[] | undefined): Source[] {
  const out: Source[] = []
  for (const s of sources ?? []) {
    const url = safeSourceUrl(s?.url)
    if (!url || url.length > 500) continue
    const title = (typeof s.title === 'string' ? s.title.trim() : '').slice(0, 200) || new URL(url).hostname
    out.push({ title, url })
    if (out.length === 5) break
  }
  return out
}
