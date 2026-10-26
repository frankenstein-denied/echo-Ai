import type { EchoItemsContext, EchoMealType, EchoRequest } from './types'

const PROFILE_MAX = 1500
const RECENT_MAX = 10
const RECENT_TEXT_MAX = 500
const LABELS_MAX = 40
const LABEL_LEN = 60
const CHECK_IN_PREFIX = 'Check-in time:'

/** Pull the check-in time ("Check-in time: HH:MM") out of the client-built profile summary. */
export function extractCheckInTime(profile: string): string {
  const m = /check-?in(?: time)?\s*[:=]\s*([01]?\d|2[0-3]):([0-5]\d)/i.exec(profile)
  if (!m) return '09:00'
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

type ProfileInput = {
  preferredName?: string
  tone?: string
  checkInTime?: string
  priorities?: string[]
  yearGoals?: string[]
  importantPeople?: string[]
}
type MessageInput = { role: 'user' | 'assistant'; text: string }
type MemoryInputLike = { label: string; type: string; mentions?: number; lastSeenAt?: { toMillis(): number } | null }

function listLine(name: string, items: string[] | undefined): string | null {
  const clean = (items ?? []).map((s) => s.trim()).filter(Boolean)
  return clean.length ? `${name}: ${clean.join(', ')}` : null
}

export function buildProfileSummary(profile: ProfileInput): string {
  const lines = [
    profile.preferredName?.trim() ? `Name: ${profile.preferredName.trim()}` : null,
    profile.tone?.trim() ? `Tone: ${profile.tone.trim()}` : null,
    // The router reads this exact line via extractCheckInTime.
    profile.checkInTime ? `${CHECK_IN_PREFIX} ${profile.checkInTime}` : null,
    listLine('Priorities', profile.priorities),
    listLine('Year goals', profile.yearGoals),
    listLine('Important people', profile.importantPeople),
  ].filter((l): l is string => !!l)
  // Over the cap: drop the last non-check-in line until it fits.
  while (lines.join('\n').length > PROFILE_MAX) {
    let idx = lines.length - 1
    while (idx >= 0 && lines[idx].startsWith(CHECK_IN_PREFIX)) idx--
    if (idx < 0) break
    lines.splice(idx, 1)
  }
  return lines.join('\n').slice(0, PROFILE_MAX)
}

export function buildContext(profile: ProfileInput, messages: MessageInput[], memories: MemoryInputLike[], items?: EchoItemsContext): EchoRequest['context'] {
  const recentMessages = messages
    .filter((m) => m.text.trim())
    .slice(-RECENT_MAX)
    .map((m) => ({ role: m.role, text: m.text.trim().slice(0, RECENT_TEXT_MAX) }))
  const memoryLabels = [...memories]
    .filter((m) => m.label.trim())
    .sort((a, b) => (b.mentions ?? 1) - (a.mentions ?? 1) || (b.lastSeenAt?.toMillis() ?? 0) - (a.lastSeenAt?.toMillis() ?? 0))
    .slice(0, LABELS_MAX)
    .map((m) => ({ label: m.label.trim().slice(0, LABEL_LEN), type: m.type, mentions: m.mentions ?? 1 }))
  return { profile: buildProfileSummary(profile), recentMessages, memoryLabels, ...(items ? { items } : {}) }
}

// ---------- short refs for existing items (typed chat context and the call instruction) ----------
// The model sees "r1", "g2", "n3", "m1"; the browser keeps the ref -> Firestore id map. Ids never leave the client.

export type RefKind = 'reminder' | 'goal' | 'note' | 'meal'
export const REF_PREFIX: Record<RefKind, string> = { reminder: 'r', goal: 'g', note: 'n', meal: 'm' }
export const ITEM_CAPS = { reminders: 20, goals: 20, notes: 10, meals: 12, milestones: 8, title: 100, milestone: 80, description: 100 } as const
export type RefEntry = { kind: RefKind; id: string; title: string }
export type RefMap = { entries: Record<string, RefEntry>; next: Record<RefKind, number> }

export function emptyRefMap(): RefMap {
  return { entries: {}, next: { reminder: 1, goal: 1, note: 1, meal: 1 } }
}

/** Register a doc and return its ref (the existing ref when the id is already mapped). */
export function addRef(map: RefMap, kind: RefKind, id: string, title: string): string {
  for (const [ref, e] of Object.entries(map.entries)) {
    if (e.kind === kind && e.id === id) {
      e.title = title || e.title
      return ref
    }
  }
  const ref = `${REF_PREFIX[kind]}${map.next[kind]++}`
  map.entries[ref] = { kind, id, title }
  return ref
}

/** Doc for a ref, only when the ref belongs to the expected kind. */
export function resolveRef(map: RefMap, ref: string, kind: RefKind): RefEntry | null {
  const e = Object.prototype.hasOwnProperty.call(map.entries, ref) ? map.entries[ref] : undefined
  return e && e.kind === kind ? e : null
}

export function removeRef(map: RefMap, ref: string): void {
  delete map.entries[ref]
}

/** The ref map as item lists (refs + titles only), so the router's sanitizer can validate refs during a call. */
export function refsAsItems(map: RefMap, caloriesEnabled: boolean): EchoItemsContext {
  const of = (kind: RefKind) => Object.entries(map.entries).filter(([, e]) => e.kind === kind)
  return {
    reminders: of('reminder').map(([ref, e]) => ({ ref, title: e.title, due: '' })),
    goals: of('goal').map(([ref, e]) => ({ ref, title: e.title, progress: 0, milestones: [] })),
    notes: of('note').map(([ref, e]) => ({ ref, title: e.title })),
    health: '',
    meals: caloriesEnabled ? of('meal').map(([ref, e]) => ({ ref, mealType: 'snack' as EchoMealType, description: e.title, calories: 0 })) : [],
    caloriesEnabled,
  }
}

export type RefSource = {
  reminders: { id: string; title: string; dueAtMs: number; done?: boolean }[]
  goals: { id: string; title: string; progress?: number; milestones?: { text?: string; done?: boolean }[]; updatedAtMs?: number }[]
  notes: { id: string; title: string; updatedAtMs?: number }[]
  health: { mood?: number; moodTag?: string; sleepMinutes?: number; waterGlasses?: number; energy?: string } | null
  meals: { id: string; mealType: EchoMealType; description: string; totalCalories: number; createdAtMs?: number }[]
  caloriesEnabled: boolean
}

const clipText = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const OVERDUE_WINDOW_MS = 36 * 3600e3

function humanDue(ms: number, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms))
  } catch {
    return new Date(ms).toISOString()
  }
}

export function formatHealthLine(h: RefSource['health']): string {
  if (!h) return ''
  const parts: string[] = []
  if (typeof h.mood === 'number') parts.push(`mood ${h.mood}${h.moodTag ? ` (${h.moodTag})` : ''}`)
  else if (h.moodTag) parts.push(`mood ${h.moodTag}`)
  if (typeof h.sleepMinutes === 'number') parts.push(`sleep ${h.sleepMinutes} min`)
  if (typeof h.waterGlasses === 'number') parts.push(`water ${h.waterGlasses} glasses`)
  if (h.energy) parts.push(`energy ${h.energy}`)
  return parts.join(', ')
}

/**
 * Build the capped item lists with refs: open reminders (not done, due from 36 h ago on, soonest first),
 * goals (recently updated first), recent notes, today's health and today's meals (only when calories are on).
 * Pass an existing map to keep refs stable (a call keeps one map for its whole length).
 */
export function buildItemsContext(src: RefSource, nowMs: number, timeZone: string, map: RefMap = emptyRefMap()): { items: EchoItemsContext; refs: RefMap } {
  const reminders = src.reminders
    .filter((r) => !r.done && Number.isFinite(r.dueAtMs) && r.dueAtMs >= nowMs - OVERDUE_WINDOW_MS && clipText(r.title, 1))
    .sort((a, b) => a.dueAtMs - b.dueAtMs)
    .slice(0, ITEM_CAPS.reminders)
    .map((r) => {
      const title = clipText(r.title, ITEM_CAPS.title)
      return { ref: addRef(map, 'reminder', r.id, title), title, due: humanDue(r.dueAtMs, timeZone) }
    })
  const goals = [...src.goals]
    .filter((g) => clipText(g.title, 1))
    .sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))
    .slice(0, ITEM_CAPS.goals)
    .map((g) => {
      const title = clipText(g.title, ITEM_CAPS.title)
      const milestones = (Array.isArray(g.milestones) ? g.milestones : [])
        .map((m) => ({ text: clipText(m?.text, ITEM_CAPS.milestone), done: !!m?.done }))
        .filter((m) => m.text)
        .slice(0, ITEM_CAPS.milestones)
      const progress = Math.round(Math.min(100, Math.max(0, typeof g.progress === 'number' && Number.isFinite(g.progress) ? g.progress : 0)))
      return { ref: addRef(map, 'goal', g.id, title), title, progress, milestones }
    })
  const notes = [...src.notes]
    .filter((n) => clipText(n.title, 1))
    .sort((a, b) => (b.updatedAtMs ?? 0) - (a.updatedAtMs ?? 0))
    .slice(0, ITEM_CAPS.notes)
    .map((n) => {
      const title = clipText(n.title, ITEM_CAPS.title)
      return { ref: addRef(map, 'note', n.id, title), title }
    })
  const meals = src.caloriesEnabled
    ? [...src.meals]
        .sort((a, b) => (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0))
        .slice(0, ITEM_CAPS.meals)
        .map((m) => {
          const description = clipText(m.description, ITEM_CAPS.description)
          return { ref: addRef(map, 'meal', m.id, description), mealType: m.mealType, description, calories: Math.round(m.totalCalories || 0) }
        })
    : []
  return { items: { reminders, goals, notes, health: formatHealthLine(src.health), meals, caloriesEnabled: src.caloriesEnabled }, refs: map }
}

/** Plain-text rendering of the item lists for the model (typed chat and the call instruction). */
export function renderItems(items: EchoItemsContext | undefined): string {
  if (!items) return '(not available)'
  const rem = items.reminders.length ? items.reminders.map((r) => `${r.ref}: ${r.title} (due ${r.due})`).join('\n') : '(none)'
  const goals = items.goals.length
    ? items.goals
        .map((g) => `${g.ref}: ${g.title} (${g.progress}%)${g.milestones.length ? `; milestones: ${g.milestones.map((m) => `${m.done ? '[x]' : '[ ]'} ${m.text}`).join(', ')}` : ''}`)
        .join('\n')
    : '(none)'
  const notes = items.notes.length ? items.notes.map((n) => `${n.ref}: ${n.title}`).join('\n') : '(none)'
  const meals = !items.caloriesEnabled
    ? 'Calorie tracking is OFF: do not log meals; tell the user it is turned off in Settings.'
    : items.meals.length
      ? items.meals.map((m) => `${m.ref}: ${m.mealType}: ${m.description} (${m.calories} kcal)`).join('\n')
      : '(none yet today)'
  return `Open reminders:\n${rem}\nGoals:\n${goals}\nRecent notes:\n${notes}\nHealth today: ${items.health || 'nothing logged'}\nMeals today:\n${meals}`
}

// ---------- call greeting ----------
/** Client kickoff text that asks Echo to greet first (never shown as a user bubble; the persona knows the marker). */
export const GREETING_MARKER = '[call connected]'

export function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

export function greetingKickoff(clientTime: string): string {
  const m = /T(\d{2}):(\d{2})/.exec(clientTime)
  const hour = m ? Number(m[1]) : 12
  return `${GREETING_MARKER} Local time ${m ? `${m[1]}:${m[2]}` : 'unknown'} (${partOfDay(hour)}). Greet the user now.`
}
