import { Type, type FunctionDeclaration } from '@google/genai'
import { READ_TOOL_NAMES, type ReadToolName } from './live-read'
import { sanitizeEchoResponse } from './sanitize'
import type { EchoAction, EchoMemoryLabel, EchoResponse, MemoryInput } from './types'

// Function tools for Echo calls. They mirror the router's EchoAction variants plus memories;
// connectors have no tool (Echo says verbally that they are not available yet).

const MEMORY_TYPE_ENUM = ['diary', 'task', 'goal', 'health', 'person', 'connector', 'interest', 'topic']
const s = (description: string) => ({ type: Type.STRING, description })
const int = (description: string) => ({ type: Type.INTEGER, description })

export const WRITE_TOOL_NAMES = ['save_note', 'add_goal', 'log_health', 'add_reminder', 'save_memories'] as const
export const LIVE_TOOL_NAMES = [...WRITE_TOOL_NAMES, ...READ_TOOL_NAMES] as const
export type LiveToolName = (typeof WRITE_TOOL_NAMES)[number]

export const LIVE_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'save_note',
    description: 'Save something worth re-reading: an idea, reflection or diary entry. Not for small talk or plain questions.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: s('short title'),
        body: s('full text of the note, in the user\'s words where possible'),
        category: s('Diary, Work, Health, Family, Learning, Personal...'),
        tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'up to 5 short lowercase tags' },
      },
      required: ['title', 'body', 'category'],
    },
  },
  {
    name: 'add_goal',
    description: 'Save a longer-term aim or commitment to progress.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: s('short goal title'),
        category: s('life area, e.g. Health, Career, Learning, Personal'),
        targetDate: s('optional target date, YYYY-MM-DD'),
      },
      required: ['title', 'category'],
    },
  },
  {
    name: 'log_health',
    description: 'Log mood, sleep, water or energy for today or a named day. Give at least one measurement.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        date: s('YYYY-MM-DD in the user\'s local time; default today'),
        mood: int('mood 1-10'),
        sleepMinutes: int('minutes slept (6 hours = 360)'),
        waterGlasses: int('glasses of water'),
        energy: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
      },
    },
  },
  {
    name: 'add_reminder',
    description: 'Set a reminder for something to do at a time.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        title: s('what to be reminded of, e.g. Call Mama'),
        dueAt: s('local ISO 8601 with the user\'s UTC offset, e.g. 2026-10-25T20:30:00+08:00'),
        fuzzyTime: { type: Type.STRING, enum: ['morning', 'afternoon', 'evening', 'tonight'], description: 'only when the user gave a vague time of day and dueAt is date-only' },
      },
      required: ['title', 'dueAt'],
    },
  },
  {
    name: 'save_memories',
    description: 'Remember the people, interests, topics and recurring activities from what the user said, linked to each other and to known memories.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        memories: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: s('short canonical label, max 60 characters, Title Case for topics and interests'),
              type: { type: Type.STRING, enum: MEMORY_TYPE_ENUM },
              links: {
                type: Type.ARRAY,
                description: 'related memories from this call or the known list, exact label and type',
                items: {
                  type: Type.OBJECT,
                  properties: { label: s('exact label of the related memory'), type: { type: Type.STRING, enum: MEMORY_TYPE_ENUM } },
                  required: ['label', 'type'],
                },
              },
            },
            required: ['label', 'type'],
          },
        },
      },
      required: ['memories'],
    },
  },
  // Read tools: run in the browser with the user's own Firestore access; compact results (~2 KB max).
  {
    name: 'get_goals',
    description: "Read the user's goals with progress (0-100), target date and milestones done/total, most recently updated first.",
  },
  {
    name: 'get_reminders',
    description: "Read the user's reminders. range: today (all of today's, done or not), upcoming (not done, soonest first; default) or all (newest first).",
    parameters: { type: Type.OBJECT, properties: { range: { type: Type.STRING, enum: ['today', 'upcoming', 'all'] } } },
  },
  {
    name: 'search_notes',
    description: "Search the user's notes and diary entries by words in the title, body or tags (omit query for the latest notes). Returns title, category, updated date and a snippet.",
    parameters: { type: Type.OBJECT, properties: { query: s('words to look for'), limit: int('max results, 1-10 (default 5)') } },
  },
  {
    name: 'get_health',
    description: "Read the user's health logs (mood 1-10, sleep minutes, water glasses, energy) for the last N days, newest first.",
    parameters: { type: Type.OBJECT, properties: { days: int('how many days back including today, 1-14 (default 7)') } },
  },
  {
    name: 'get_memories',
    description: "Read the user's 2nd Brain memories (people, interests, topics...) with mention counts and linked memories. Optional query filters by label, type or linked label.",
    parameters: { type: Type.OBJECT, properties: { query: s('label, type or related label to look for') } },
  },
]

const ACTION_TYPE: Record<Exclude<LiveToolName, 'save_memories'>, EchoAction['type']> = {
  save_note: 'note',
  add_goal: 'goal',
  log_health: 'health',
  add_reminder: 'reminder',
}

export type ToolContext = {
  /** The user's local time right now (ISO with offset), used to resolve reminder times. */
  clientTime: string
  /** HH:MM default for date-only reminders. */
  checkInTime: string
  /** Known memory labels for link resolution (grows as the call saves memories). */
  memoryLabels: Pick<EchoMemoryLabel, 'label' | 'type'>[]
}

export type MappedTool = { ok: true; response: EchoResponse } | { ok: false; error: string }

/** Validate one tool call with the router's sanitizers and turn it into an EchoResponse-shaped bundle. */
export function mapToolCall(name: string | undefined, args: unknown, ctx: ToolContext): MappedTool {
  const a = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, unknown>) : {}
  if (name === 'save_memories') {
    const res = sanitizeEchoResponse({ memories: a.memories }, ctx.clientTime, ctx.checkInTime, ctx.memoryLabels)
    if (!res.memories.length) return { ok: false, error: 'no valid memories' }
    return { ok: true, response: { reply: '', actions: [], memories: res.memories, trace: [] } }
  }
  const type = name && name in ACTION_TYPE ? ACTION_TYPE[name as keyof typeof ACTION_TYPE] : null
  if (!type) return { ok: false, error: `unknown tool ${String(name)}` }
  const res = sanitizeEchoResponse({ actions: [{ ...a, type }] }, ctx.clientTime, ctx.checkInTime, ctx.memoryLabels)
  const action = res.actions.find((x) => x.type === type)
  if (!action) {
    const why = type === 'reminder' ? 'could not tell when to remind' : type === 'health' ? 'no valid measurement' : 'missing required fields'
    return { ok: false, error: why }
  }
  return { ok: true, response: { reply: '', actions: [action], memories: [], trace: [] } }
}

export type ToolCallLike = { id?: string; name?: string; args?: unknown }
export type SavedLike = { type: EchoAction['type'] | 'memory'; label: string }
export type ApplyFn = (res: EchoResponse) => Promise<{ saved: SavedLike[]; failed: string[] }>
export type ReadFn = (name: ReadToolName, args: Record<string, unknown>) => Promise<unknown[]>
export type ToolFunctionResponse = { id?: string; name?: string; response: { output?: Record<string, unknown>; error?: string } }

function describe(action: EchoAction | undefined, memories: MemoryInput[]): Record<string, unknown> {
  if (!action) return { saved: 'memories', labels: memories.map((m) => m.label) }
  switch (action.type) {
    case 'reminder':
      return { saved: 'reminder', title: action.title, dueAt: action.dueAt }
    case 'health':
      return { saved: 'health', ...action }
    case 'note':
    case 'goal':
      return { saved: action.type, title: action.title }
    default:
      return { saved: action.type }
  }
}

export type TaggedSaved = SavedLike & { callId?: string }
export type WriteOutcome = { saved: TaggedSaved[]; failed: string[] }

export type ToolBatchResult = {
  responses: ToolFunctionResponse[]
  /** Confirmed saves (server-acknowledged within the window), tagged with their call id. */
  saved: TaggedSaved[]
  failed: string[]
  /** Writes not acknowledged within the window (answered as status 'saving'); resolves with their real outcome. */
  late: Promise<WriteOutcome>
}

/** Writes are answered once Firestore acknowledges them, or as status 'saving' after this long. */
export const CONFIRM_WITHIN_MS = 2500

/**
 * Validate and execute a batch of tool calls in parallel. Every call gets exactly one response, in call order;
 * a failure in one call never blocks the others. Action writes (note/goal/health/reminder) are awaited until the
 * server acknowledges them, up to confirmWithinMs: an acknowledged write answers ok (or an error), a slower one
 * answers {ok: true, status: 'saving'} (Echo must say "saving", never "done") and reports through `late`.
 * save_memories always answers {ok: true, status: 'saving'} immediately and reports through `late`.
 * Saved memory labels are added to ctx.memoryLabels so later links resolve.
 */
export async function executeToolCalls(
  calls: ToolCallLike[],
  ctx: ToolContext,
  apply: ApplyFn,
  opts: { read?: ReadFn; confirmWithinMs?: number } = {},
): Promise<ToolBatchResult> {
  const confirmWithinMs = opts.confirmWithinMs ?? CONFIRM_WITHIN_MS
  const saved: TaggedSaved[] = []
  const failed: string[] = []
  const late: Promise<WriteOutcome>[] = []
  const tag = (r: { saved: SavedLike[]; failed: string[] }, callId?: string): WriteOutcome => ({ saved: r.saved.map((x) => ({ ...x, ...(callId ? { callId } : {}) })), failed: r.failed })
  const safeApply = (res: EchoResponse, name: string, callId?: string): Promise<WriteOutcome> =>
    apply(res).then((r) => tag(r, callId), () => ({ saved: [], failed: [name] }))

  // Memory upserts are transactions (~2 s in the browser) that Echo never announces: they answer as 'saving'
  // right away and start after the action writes (so they don't slow those acks); outcomes arrive via `late`.
  const memoryJobs: { res: EchoResponse; name: string; callId?: string }[] = []

  const responses = await Promise.all(
    calls.map(async (call): Promise<ToolFunctionResponse> => {
      if ((READ_TOOL_NAMES as readonly string[]).includes(call.name ?? '')) {
        if (!opts.read) return { id: call.id, name: call.name, response: { error: 'reading is not available' } }
        try {
          const args = call.args && typeof call.args === 'object' && !Array.isArray(call.args) ? (call.args as Record<string, unknown>) : {}
          const results = await opts.read(call.name as ReadToolName, args)
          return { id: call.id, name: call.name, response: { output: { count: results.length, results } } }
        } catch {
          return { id: call.id, name: call.name, response: { error: 'could not read that right now' } }
        }
      }
      const mapped = mapToolCall(call.name, call.args, ctx)
      if (!mapped.ok) return { id: call.id, name: call.name, response: { error: mapped.error } }
      const { actions, memories } = mapped.response
      if (!actions.length) {
        for (const m of memories) {
          if (!ctx.memoryLabels.some((k) => k.label === m.label && k.type === m.type)) ctx.memoryLabels.push({ label: m.label, type: m.type })
        }
        memoryJobs.push({ res: mapped.response, name: call.name ?? 'save_memories', callId: call.id })
        return { id: call.id, name: call.name, response: { output: { ok: true, status: 'saving', ...describe(undefined, memories) } } }
      }
      const write = safeApply(mapped.response, call.name ?? 'tool', call.id)
      let timer: ReturnType<typeof setTimeout> | undefined
      const r = await Promise.race([write, new Promise<null>((res) => (timer = setTimeout(() => res(null), confirmWithinMs)))])
      clearTimeout(timer)
      const what = describe(actions[0], memories)
      if (!r) {
        late.push(write)
        return { id: call.id, name: call.name, response: { output: { ok: true, status: 'saving', ...what } } }
      }
      saved.push(...r.saved)
      failed.push(...r.failed)
      if (r.failed.length || !r.saved.length) return { id: call.id, name: call.name, response: { error: 'could not save' } }
      for (const m of memories) {
        if (!ctx.memoryLabels.some((k) => k.label === m.label && k.type === m.type)) ctx.memoryLabels.push({ label: m.label, type: m.type })
      }
      return { id: call.id, name: call.name, response: { output: { ok: true, ...what } } }
    }),
  )
  for (const j of memoryJobs) late.push(safeApply(j.res, j.name, j.callId))
  const lateAll = Promise.all(late).then((rs) => ({ saved: rs.flatMap((r) => r.saved), failed: rs.flatMap((r) => r.failed) }))
  return { responses, saved, failed, late: lateAll }
}
