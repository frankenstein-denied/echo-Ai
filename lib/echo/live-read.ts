// Result shaping for Echo call read tools (pure, unit-tested). Inputs are plain values (ms timestamps),
// outputs are compact JSON-able arrays, newest/soonest first, capped to ~2 KB per result.

export const READ_TOOL_NAMES = ['get_goals', 'get_reminders', 'search_notes', 'get_health', 'get_memories'] as const
export type ReadToolName = (typeof READ_TOOL_NAMES)[number]
export const RESULT_MAX_BYTES = 2000
export const SNAPSHOT_MAX = 800

export type GoalIn = { title: string; category?: string; progress?: number; targetDate?: string; milestones?: { done?: boolean }[]; updatedAtMs?: number }
export type ReminderIn = { title: string; dueAtMs: number; done?: boolean }
export type NoteIn = { title: string; body?: string; category?: string; tags?: string[]; updatedAtMs?: number }
export type HealthIn = { date: string; mood?: number; sleepMinutes?: number; waterGlasses?: number; energy?: string }
export type MemoryIn = { id: string; label: string; type: string; mentions?: number; links?: string[] }

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.trim().slice(0, n) : '')
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

/** Drop items from the end until the JSON fits in maxBytes (UTF-8). */
export function capJson<T>(items: T[], maxBytes = RESULT_MAX_BYTES): T[] {
  const out = [...items]
  const size = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length
  while (out.length && size(out) > maxBytes) out.pop()
  return out
}

export function shapeGoals(goals: GoalIn[]) {
  return capJson(
    [...goals]
      .sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))
      .slice(0, 20)
      .map((g) => {
        const ms = Array.isArray(g.milestones) ? g.milestones : []
        return {
          title: clip(g.title, 100),
          category: clip(g.category, 40) || 'Personal',
          progress: Math.round(Math.min(100, Math.max(0, num(g.progress) ?? 0))),
          ...(g.targetDate ? { targetDate: g.targetDate } : {}),
          milestones: `${ms.filter((m) => m?.done).length}/${ms.length}`,
        }
      }),
  )
}

/** Local YYYY-MM-DD of an instant in a time zone. */
export function localDate(ms: number, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms))
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function humanTime(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms))
}

export type ReminderRange = 'today' | 'upcoming' | 'all'
export function parseRange(v: unknown): ReminderRange {
  return v === 'today' || v === 'all' ? v : 'upcoming'
}

export function shapeReminders(rems: ReminderIn[], range: ReminderRange, nowMs: number, timeZone: string) {
  const today = localDate(nowMs, timeZone)
  let list = rems.filter((r) => Number.isFinite(r.dueAtMs))
  if (range === 'today') list = list.filter((r) => localDate(r.dueAtMs, timeZone) === today).sort((a, b) => a.dueAtMs - b.dueAtMs)
  else if (range === 'upcoming') list = list.filter((r) => !r.done && r.dueAtMs >= nowMs).sort((a, b) => a.dueAtMs - b.dueAtMs)
  else list = [...list].sort((a, b) => b.dueAtMs - a.dueAtMs)
  return capJson(list.slice(0, 20).map((r) => ({ title: clip(r.title, 100), dueAt: humanTime(r.dueAtMs, timeZone), done: !!r.done })))
}

function snippetAround(text: string, terms: string[], max = 200): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= max) return flat
  const lower = flat.toLowerCase()
  const hit = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, Math.min(hit - 60, flat.length - max))
  return flat.slice(start, start + max)
}

export function searchNotes(notes: NoteIn[], query: unknown, limit: unknown, timeZone: string) {
  const n = Math.min(10, Math.max(1, Math.round(num(limit) ?? 5)))
  const terms = clip(query, 100).toLowerCase().split(/\s+/).filter((t) => t.length > 1)
  const scored = notes.map((note) => {
    const hay = `${note.title} ${note.body ?? ''} ${(note.tags ?? []).join(' ')} ${note.category ?? ''}`.toLowerCase()
    const score = terms.length ? terms.filter((t) => hay.includes(t)).length : 1
    return { note, score }
  })
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score || (b.note.updatedAtMs ?? 0) - (a.note.updatedAtMs ?? 0))
  return capJson(
    hits.slice(0, n).map(({ note }) => ({
      title: clip(note.title, 100),
      category: clip(note.category, 40),
      updated: note.updatedAtMs ? localDate(note.updatedAtMs, timeZone) : '',
      snippet: snippetAround(note.body ?? '', terms),
    })),
  )
}

/** The last `days` local dates ending today (YYYY-MM-DD strings compare lexically). */
export function shapeHealth(logs: HealthIn[], days: unknown, today: string) {
  const d = Math.min(14, Math.max(1, Math.round(num(days) ?? 7)))
  const [y, m, dd] = today.split('-').map(Number)
  const from = new Date(Date.UTC(y, m - 1, dd - (d - 1))).toISOString().slice(0, 10)
  return capJson(
    logs
      .filter((l) => typeof l.date === 'string' && l.date >= from && l.date <= today)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .map((l) => ({
        date: l.date,
        ...(num(l.mood) !== undefined ? { mood: l.mood } : {}),
        ...(num(l.sleepMinutes) !== undefined ? { sleepMinutes: l.sleepMinutes } : {}),
        ...(num(l.waterGlasses) !== undefined ? { waterGlasses: l.waterGlasses } : {}),
        ...(typeof l.energy === 'string' ? { energy: l.energy } : {}),
      })),
  )
}

export function shapeMemories(mems: MemoryIn[], query: unknown) {
  const q = clip(query, 60).toLowerCase()
  const byId = new Map(mems.map((m) => [m.id, m.label]))
  const list = mems
    .filter((m) => !q || m.label.toLowerCase().includes(q) || m.type === q || (m.links ?? []).some((id) => (byId.get(id) ?? '').toLowerCase().includes(q)))
    .sort((a, b) => (b.mentions ?? 1) - (a.mentions ?? 1))
    .slice(0, 25)
  return capJson(
    list.map((m) => ({
      label: clip(m.label, 60),
      type: m.type,
      mentions: m.mentions ?? 1,
      linked: (m.links ?? []).map((id) => byId.get(id)).filter((l): l is string => !!l).slice(0, 6),
    })),
  )
}

/** Short "current snapshot" for the session instruction: active goals, today's/next reminders, today's health. */
export function buildSnapshot(goals: GoalIn[], rems: ReminderIn[], health: HealthIn[], nowMs: number, timeZone: string): string {
  const today = localDate(nowMs, timeZone)
  const active = shapeGoals(goals).filter((g) => g.progress < 100).slice(0, 5)
  const todayRems = shapeReminders(rems, 'today', nowMs, timeZone).filter((r) => !r.done).slice(0, 5)
  const next = todayRems.length ? [] : shapeReminders(rems, 'upcoming', nowMs, timeZone).slice(0, 3)
  const h = shapeHealth(health, 1, today)[0]
  const lines = [
    `Active goals: ${active.length ? active.map((g) => `${g.title} (${g.progress}%)`).join('; ') : 'none'}`,
    todayRems.length ? `Reminders today: ${todayRems.map((r) => `${r.title} at ${r.dueAt}`).join('; ')}` : `Next reminders: ${next.length ? next.map((r) => `${r.title} at ${r.dueAt}`).join('; ') : 'none'}`,
    `Health today: ${h ? Object.entries(h).filter(([k]) => k !== 'date').map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing logged' : 'nothing logged'}`,
  ]
  return lines.join('\n').slice(0, SNAPSHOT_MAX)
}
