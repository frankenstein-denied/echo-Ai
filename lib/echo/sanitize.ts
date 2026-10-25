import type { EchoAction, EchoEnergy, EchoRequest, EchoResponse, MemoryInput, MemoryType } from './types'

export const LIMITS = {
  text: 2000,
  profile: 1500,
  recentMessages: 10,
  recentMessageText: 500,
  memoryLabels: 40,
  labelLength: 60,
  timeZone: 64,
  reply: 1200,
  memories: 10,
  actions: 8,
  trace: 8,
  traceLine: 160,
  title: 120,
  body: 4000,
  tags: 8,
  tagLength: 30,
  category: 40,
  provider: 40,
  request: 500,
  memoryLinks: 8,
} as const

const MEMORY_TYPES: MemoryType[] = ['diary', 'task', 'goal', 'health', 'person', 'connector', 'interest', 'topic']
const ENERGIES: EchoEnergy[] = ['low', 'medium', 'high']
const FUZZY_HOURS: Record<string, string> = { morning: '09:00', afternoon: '14:00', evening: '20:00', tonight: '20:00' }

const CLIENT_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const LOCAL_DT_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/

type Obj = Record<string, unknown>

function isObj(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function offsetToMinutes(offset: string): number {
  if (offset === 'Z') return 0
  const sign = offset[0] === '-' ? -1 : 1
  return sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)))
}

function minutesToOffset(mins: number): string {
  const sign = mins < 0 ? '-' : '+'
  const abs = Math.abs(mins)
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

function validDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

function isValidDateString(s: string): boolean {
  const m = DATE_RE.exec(s)
  return !!m && validDate(Number(m[1]), Number(m[2]), Number(m[3]))
}

type ParsedClock = { wallMs: number; offsetMin: number }

/** Parse an ISO string with offset into wall-clock ms (as if UTC) plus offset minutes. */
function parseClientTime(s: string): ParsedClock | null {
  const m = CLIENT_TIME_RE.exec(s)
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const h = Number(m[4])
  const mi = Number(m[5])
  const sec = m[6] ? Number(m[6]) : 0
  if (!validDate(y, mo, d) || h > 23 || mi > 59 || sec > 59) return null
  return { wallMs: Date.UTC(y, mo - 1, d, h, mi, sec), offsetMin: offsetToMinutes(m[7]) }
}

function formatWall(wallMs: number, offsetMin: number): string {
  const d = new Date(wallMs)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00${minutesToOffset(offsetMin)}`
}

function validHHMM(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

function hhmmToMs(s: string): number {
  const [h, m] = s.split(':').map(Number)
  return (h * 60 + m) * 60000
}

export function parseEchoRequest(body: unknown): EchoRequest | { error: string } {
  if (!isObj(body)) return { error: 'Body must be a JSON object' }
  if (typeof body.text !== 'string') return { error: 'text is required' }
  const text = body.text.trim()
  if (!text) return { error: 'text is required' }
  if (text.length > LIMITS.text) return { error: `text must be at most ${LIMITS.text} characters` }
  if (typeof body.clientTime !== 'string' || !parseClientTime(body.clientTime)) {
    return { error: 'clientTime must be ISO 8601 with offset' }
  }
  if (typeof body.timeZone !== 'string' || !body.timeZone.trim() || body.timeZone.trim().length > LIMITS.timeZone) {
    return { error: 'timeZone is required' }
  }
  const ctx = isObj(body.context) ? body.context : {}
  const recentMessages: EchoRequest['context']['recentMessages'] = []
  if (Array.isArray(ctx.recentMessages)) {
    for (const m of ctx.recentMessages.slice(-LIMITS.recentMessages)) {
      if (!isObj(m) || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') continue
      const t = m.text.trim().slice(0, LIMITS.recentMessageText)
      if (t) recentMessages.push({ role: m.role, text: t })
    }
  }
  const memoryLabels: EchoRequest['context']['memoryLabels'] = []
  if (Array.isArray(ctx.memoryLabels)) {
    for (const m of ctx.memoryLabels.slice(0, LIMITS.memoryLabels)) {
      if (!isObj(m)) continue
      const label = str(m.label, LIMITS.labelLength)
      if (!label) continue
      const mentions = typeof m.mentions === 'number' && Number.isFinite(m.mentions) ? Math.max(0, Math.round(m.mentions)) : 0
      memoryLabels.push({ label, type: str(m.type, 20), mentions })
    }
  }
  return {
    text,
    clientTime: body.clientTime,
    timeZone: body.timeZone.trim(),
    context: { profile: str(ctx.profile, LIMITS.profile), recentMessages, memoryLabels },
  }
}

export function slugifyLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function clampInt(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined
  return Math.min(max, Math.max(min, Math.round(v)))
}

const DAY = 86400000

/** Resolve a reminder time to ISO with the client's offset. */
function resolveDueAt(raw: unknown, fuzzy: unknown, client: ParsedClock, checkInTime: string): string | null {
  const fallbackTime = validHHMM(checkInTime) ? checkInTime : '09:00'
  const offset = client.offsetMin
  const nowInstant = client.wallMs - offset * 60000
  const fuzzyTime = typeof fuzzy === 'string' ? FUZZY_HOURS[fuzzy.trim().toLowerCase()] : undefined
  const defaultTime = fuzzyTime ?? fallbackTime

  let wallMs: number
  const s = typeof raw === 'string' ? raw.trim() : ''
  const dt = LOCAL_DT_RE.exec(s)
  const dateOnly = DATE_RE.exec(s)
  if (dt && validDate(Number(dt[1]), Number(dt[2]), Number(dt[3])) && Number(dt[4]) < 24 && Number(dt[5]) < 60) {
    const wall = Date.UTC(Number(dt[1]), Number(dt[2]) - 1, Number(dt[3]), Number(dt[4]), Number(dt[5]), dt[6] ? Number(dt[6]) : 0)
    // Convert a stated instant into the client's wall clock; no offset means it is already local.
    wallMs = dt[7] ? wall - offsetToMinutes(dt[7]) * 60000 + offset * 60000 : wall
    if (fuzzyTime && dt[4] === '00' && dt[5] === '00') {
      wallMs = Math.floor(wallMs / DAY) * DAY + hhmmToMs(fuzzyTime)
    }
  } else if (dateOnly && validDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]))) {
    wallMs = Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])) + hhmmToMs(defaultTime)
  } else if (fuzzyTime) {
    wallMs = Math.floor(client.wallMs / DAY) * DAY + hhmmToMs(fuzzyTime)
  } else {
    return null
  }
  wallMs = Math.floor(wallMs / 60000) * 60000
  if (wallMs - offset * 60000 <= nowInstant) wallMs += DAY
  return formatWall(wallMs, offset)
}

export const REMINDER_DROPPED_TRACE = "Couldn't tell when to remind you — no reminder saved"

function sanitizeAction(a: unknown, client: ParsedClock, clientDate: string, checkInTime: string, notes: string[]): EchoAction | null {
  if (!isObj(a)) return null
  switch (a.type) {
    case 'note': {
      const title = str(a.title, LIMITS.title)
      const body = str(a.body, LIMITS.body)
      if (!title || !body) return null
      const tags = Array.isArray(a.tags)
        ? [...new Set(a.tags.map((t) => str(t, LIMITS.tagLength).toLowerCase()).filter(Boolean))].slice(0, LIMITS.tags)
        : []
      return { type: 'note', title, body, category: str(a.category, LIMITS.category) || 'Diary', tags }
    }
    case 'goal': {
      const title = str(a.title, LIMITS.title)
      if (!title) return null
      const out: Extract<EchoAction, { type: 'goal' }> = { type: 'goal', title, category: str(a.category, LIMITS.category) || 'Personal' }
      if (typeof a.targetDate === 'string' && isValidDateString(a.targetDate.trim())) out.targetDate = a.targetDate.trim()
      return out
    }
    case 'health': {
      let date = clientDate
      if (a.date !== undefined && a.date !== null && a.date !== '') {
        if (typeof a.date !== 'string' || !isValidDateString(a.date.trim())) return null
        date = a.date.trim()
      }
      const out: Extract<EchoAction, { type: 'health' }> = { type: 'health', date }
      const mood = clampInt(a.mood, 1, 10)
      const sleepMinutes = clampInt(a.sleepMinutes, 0, 1440)
      const waterGlasses = clampInt(a.waterGlasses, 0, 30)
      if (mood !== undefined) out.mood = mood
      if (sleepMinutes !== undefined) out.sleepMinutes = sleepMinutes
      if (waterGlasses !== undefined) out.waterGlasses = waterGlasses
      if (typeof a.energy === 'string' && ENERGIES.includes(a.energy as EchoEnergy)) out.energy = a.energy as EchoEnergy
      if (out.mood === undefined && out.sleepMinutes === undefined && out.waterGlasses === undefined && out.energy === undefined) return null
      return out
    }
    case 'reminder': {
      const title = str(a.title, LIMITS.title)
      if (!title) return null
      const dueAt = resolveDueAt(a.dueAt, a.fuzzyTime, client, checkInTime)
      if (!dueAt) {
        notes.push(REMINDER_DROPPED_TRACE)
        return null
      }
      return { type: 'reminder', title, dueAt }
    }
    case 'connector': {
      const provider = str(a.provider, LIMITS.provider)
      const request = str(a.request, LIMITS.request)
      if (!provider || !request) return null
      return { type: 'connector', provider, request }
    }
    case 'general':
      return { type: 'general' }
    default:
      return null
  }
}

type KnownLabel = { label: string; type: string }

function sanitizeMemories(raw: unknown, context: KnownLabel[]): MemoryInput[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const ctxIds = new Set<string>()
  const ctxBySlug = new Map<string, { label: string; type: MemoryType }[]>()
  for (const c of context) {
    const cs = slugifyLabel(c.label)
    if (!cs || !MEMORY_TYPES.includes(c.type as MemoryType) || ctxIds.has(`${c.type}-${cs}`)) continue
    ctxIds.add(`${c.type}-${cs}`)
    ctxBySlug.set(cs, [...(ctxBySlug.get(cs) ?? []), { label: c.label, type: c.type as MemoryType }])
  }
  const rawSlugCount = new Map<string, number>()
  for (const m of raw) {
    if (!isObj(m)) continue
    const rs = slugifyLabel(str(m.label, LIMITS.labelLength))
    if (rs) rawSlugCount.set(rs, (rawSlugCount.get(rs) ?? 0) + 1)
  }
  const kept: { label: string; type: MemoryType; id: string; rawLinks: unknown[] }[] = []
  for (const m of raw) {
    if (!isObj(m)) continue
    const label = str(m.label, LIMITS.labelLength)
    if (!label || !MEMORY_TYPES.includes(m.type as MemoryType)) continue
    const slug = slugifyLabel(label)
    if (!slug) continue
    let type = m.type as MemoryType
    let finalLabel = label
    // Same slug as exactly one existing memory (any type): reuse it instead of creating a duplicate node.
    if (!ctxIds.has(`${type}-${slug}`)) {
      const only = ctxBySlug.get(slug)
      if (only && only.length === 1 && rawSlugCount.get(slug) === 1) {
        type = only[0].type
        finalLabel = only[0].label
      }
    }
    const id = `${type}-${slug}`
    if (seen.has(id)) continue
    seen.add(id)
    kept.push({ label: finalLabel, type, id, rawLinks: Array.isArray(m.links) ? m.links : [] })
    if (kept.length >= LIMITS.memories) break
  }

  // Known targets: this response's memories plus the request's existing memories.
  const known = new Set<string>(seen)
  const bySlug = new Map<string, string[]>()
  const addKnown = (type: string, label: string) => {
    const slug = slugifyLabel(label)
    if (!slug || !MEMORY_TYPES.includes(type as MemoryType)) return
    const id = `${type}-${slug}`
    known.add(id)
    const ids = bySlug.get(slug) ?? []
    if (!ids.includes(id)) ids.push(id)
    bySlug.set(slug, ids)
  }
  for (const k of kept) addKnown(k.type, k.label)
  for (const c of context) addKnown(c.type, c.label)

  const resolve = (l: unknown): string | null => {
    if (isObj(l)) {
      const slug = slugifyLabel(str(l.label, LIMITS.labelLength))
      if (!slug || typeof l.type !== 'string') return null
      const id = `${l.type}-${slug}`
      if (known.has(id)) return id
      const only = ctxBySlug.get(slug)
      return only && only.length === 1 ? `${only[0].type}-${slug}` : null
    }
    // Bare label strings (older shape) resolve only when exactly one known memory has that slug.
    if (typeof l === 'string') {
      const ids = bySlug.get(slugifyLabel(str(l, LIMITS.labelLength)))
      return ids && ids.length === 1 ? ids[0] : null
    }
    return null
  }

  const out: MemoryInput[] = kept.map((k) => {
    const linkIds: string[] = []
    for (const l of k.rawLinks) {
      const id = resolve(l)
      if (id && id !== k.id && !linkIds.includes(id)) linkIds.push(id)
      if (linkIds.length >= LIMITS.memoryLinks) break
    }
    return { label: k.label, type: k.type, linkIds }
  })

  // Co-occurrence: a memory from this message with no connection at all joins the primary (first) memory.
  if (out.length > 1) {
    const primary = kept[0].id
    const targeted = new Set(out.flatMap((m) => m.linkIds))
    out.forEach((m, i) => {
      if (i > 0 && !m.linkIds.length && !targeted.has(kept[i].id)) m.linkIds.push(primary)
    })
  }
  return out
}

export function sanitizeEchoResponse(raw: unknown, clientTime: string, checkInTime: string, existingMemories: KnownLabel[] = []): EchoResponse {
  const obj = isObj(raw) ? raw : {}
  const client = parseClientTime(clientTime) ?? { wallMs: Date.now(), offsetMin: 0 }
  const clientDate = new Date(client.wallMs).toISOString().slice(0, 10)
  const actions: EchoAction[] = []
  const notes: string[] = []
  if (Array.isArray(obj.actions)) {
    for (const a of obj.actions.slice(0, LIMITS.actions)) {
      const s = sanitizeAction(a, client, clientDate, checkInTime, notes)
      if (s) actions.push(s)
    }
  }
  const real = actions.filter((a) => a.type !== 'general')
  const finalActions: EchoAction[] = real.length ? real : actions.slice(0, 1)
  const trace = Array.isArray(obj.trace)
    ? obj.trace.map((t) => str(t, LIMITS.traceLine)).filter(Boolean).slice(0, LIMITS.trace)
    : []
  return {
    reply: str(obj.reply, LIMITS.reply),
    actions: finalActions,
    memories: sanitizeMemories(obj.memories, existingMemories),
    trace: [...trace, ...notes].slice(0, LIMITS.trace),
  }
}
