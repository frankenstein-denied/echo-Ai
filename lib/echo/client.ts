import type { User } from 'firebase/auth'
import { doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc, where, type CollectionReference, type DocumentData } from 'firebase/firestore'
import {
  addGoal,
  addMeal,
  addNote,
  addPageMessage,
  addReminder,
  deleteGoal,
  deleteMeal,
  deleteNote,
  deleteReminder,
  goalsCol,
  healthLogsCol,
  mealsCol,
  mealsForDate,
  notesCol,
  remindersCol,
  updateGoal,
  updateMeal,
  updateNote,
  upsertHealthLog,
  upsertMemories,
  watchCalorieSettings,
  type EchoCategory,
  type Milestone,
} from '@/lib/firestore'
import { addRef, removeRef, resolveRef, type RefKind, type RefMap, type RefSource } from './context'
import type { EchoAction, EchoMealType, EchoNutrition, EchoRequest, EchoResponse } from './types'
import { deriveCategory, fallbackReply, fetchWithTimeout } from './send-helpers'
import { restoreData, type UndoEntry, type UndoInput } from './undo'

export function localIsoWithOffset(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const off = -d.getTimezoneOffset()
  const sign = off < 0 ? '-' : '+'
  const abs = Math.abs(off)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
}

export async function sendToEcho(user: User, text: string, context: EchoRequest['context']): Promise<EchoResponse> {
  const token = await user.getIdToken()
  const body: EchoRequest = {
    text,
    clientTime: localIsoWithOffset(),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    context,
  }
  const res = await fetchWithTimeout('/api/echo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(res.status === 401 ? 'Please sign in again.' : `Echo is unavailable (${res.status}).`)
  const data = (await res.json()) as Partial<EchoResponse>
  return {
    reply: typeof data.reply === 'string' ? data.reply : '',
    actions: Array.isArray(data.actions) ? data.actions : [],
    memories: Array.isArray(data.memories) ? data.memories : [],
    trace: Array.isArray(data.trace) ? data.trace : [],
    ...(data.error ? { error: true } : {}),
  }
}

/** A saved item for badges. op is absent for creations (older callers), kcal is set for meals. */
export type SavedItem = { type: EchoCategory | 'memory'; label: string; op?: 'update' | 'delete'; ref?: string; kcal?: number }
export type ApplyResult = { saved: SavedItem[]; failed: string[]; category: EchoCategory; reply: string; messageId?: string }

export type ApplyOptions = {
  /** Short ref -> doc id map for this request (typed send) or this call. New docs get refs; deleted ones lose theirs. */
  refs?: RefMap
  source?: 'chat' | 'call'
  /** Called with the deleted doc's data so the UI can offer Undo. */
  onDeleted?: (e: UndoInput) => void
  /** Calls: estimate a meal that arrives without nutrition (POST /api/nutrition). */
  estimateMeal?: (description: string, mealType: EchoMealType) => Promise<EchoNutrition>
}

const CATEGORY_OF: Record<RefKind, EchoCategory> = { reminder: 'reminder', note: 'note', goal: 'goal', meal: 'health' }
const COL_OF: Record<RefKind, (uid: string) => CollectionReference<DocumentData>> = {
  reminder: (uid) => remindersCol(uid) as unknown as CollectionReference<DocumentData>,
  note: (uid) => notesCol(uid) as unknown as CollectionReference<DocumentData>,
  goal: (uid) => goalsCol(uid) as unknown as CollectionReference<DocumentData>,
  meal: (uid) => mealsCol(uid) as unknown as CollectionReference<DocumentData>,
}
const DELETE_OF: Record<RefKind, (uid: string, id: string) => Promise<void>> = { reminder: deleteReminder, note: deleteNote, goal: deleteGoal, meal: deleteMeal }

class ApplyError extends Error {}

const healthFields = (a: Extract<EchoAction, { type: 'health' | 'health_update' }>) => ({
  ...(a.mood !== undefined ? { mood: a.mood } : {}),
  ...(a.moodTag !== undefined ? { moodTag: a.moodTag } : {}),
  ...(a.sleepMinutes !== undefined ? { sleepMinutes: a.sleepMinutes } : {}),
  ...(a.waterGlasses !== undefined ? { waterGlasses: a.waterGlasses } : {}),
  ...(a.energy !== undefined ? { energy: a.energy } : {}),
})

/** Milestones after marking (or adding) one: matched by normalized text, either way contained. */
export function applyMilestone(list: Milestone[], m: { text: string; done: boolean }): Milestone[] {
  const n = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const target = n(m.text)
  const idx = list.findIndex((x) => n(x.text) === target)
  const loose = idx >= 0 ? idx : list.findIndex((x) => !!target && (n(x.text).includes(target) || target.includes(n(x.text))))
  if (loose >= 0) return list.map((x, i) => (i === loose ? { ...x, done: m.done } : x))
  return [...list, { text: m.text, done: m.done }].slice(0, 100)
}

// Applies actions and memories (no reply); a failure in one never blocks the others. Used by typed chat and calls.
export async function applyActions(uid: string, res: Pick<EchoResponse, 'actions' | 'memories'>, opts: ApplyOptions = {}): Promise<{ saved: SavedItem[]; failed: string[] }> {
  const saved: SavedItem[] = []
  const failed: string[] = []
  const run = async (type: SavedItem['type'], label: string, fn: () => Promise<Partial<SavedItem> | void>) => {
    try {
      const extra = await fn()
      saved.push({ type, label, ...(extra || {}) })
    } catch (e) {
      if (!(e instanceof ApplyError)) console.error(`Echo: could not save ${type}`, e)
      failed.push(type === 'memory' ? label : `${type}: ${e instanceof ApplyError ? e.message : label}`)
    }
  }
  const target = (ref: string, kind: RefKind) => {
    const hit = opts.refs ? resolveRef(opts.refs, ref, kind) : null
    if (!hit) throw new ApplyError(`couldn't find that ${kind}`)
    return hit
  }
  const newRef = (kind: RefKind, id: string, title: string) => (opts.refs ? { ref: addRef(opts.refs, kind, id, title) } : {})
  for (const a of res.actions) {
    switch (a.type) {
      case 'note':
        await run('note', a.title, async () => newRef('note', await addNote(uid, { title: a.title, body: a.body, category: a.category, tags: a.tags }), a.title))
        break
      case 'goal':
        await run('goal', a.title, async () => newRef('goal', await addGoal(uid, { title: a.title, category: a.category, targetDate: a.targetDate }), a.title))
        break
      case 'health':
      case 'health_update': {
        const fields = healthFields(a)
        if (Object.keys(fields).length === 0) break
        await run('health', a.date, async () => {
          await upsertHealthLog(uid, a.date, fields)
          return a.type === 'health_update' ? { op: 'update' } : undefined
        })
        break
      }
      case 'reminder': {
        const due = new Date(a.dueAt)
        if (Number.isNaN(due.getTime())) {
          failed.push(`reminder: ${a.title}`)
          break
        }
        await run('reminder', a.title, async () => newRef('reminder', await addReminder(uid, { title: a.title, dueAt: due, source: 'chat' }), a.title))
        break
      }
      case 'connector':
        // No connector backend yet: shown as a badge only.
        saved.push({ type: 'connector', label: a.provider })
        break
      case 'meal_log':
        await run('health', `${a.mealType}: ${a.description}`, async () => {
          const n = a.nutrition ?? (opts.estimateMeal ? await opts.estimateMeal(a.description, a.mealType) : null)
          if (!n) throw new ApplyError("couldn't estimate calories")
          const id = await addMeal(uid, { date: a.date, mealType: a.mealType, description: a.description, items: n.items, totalCalories: n.totalCalories, source: opts.source ?? 'chat', estimated: true })
          return { kcal: n.totalCalories, ...newRef('meal', id, a.description) }
        })
        break
      case 'reminder_update':
        await run('reminder', opts.refs?.entries[a.ref]?.title ?? a.ref, async () => {
          const { id } = target(a.ref, 'reminder')
          const upd: Record<string, unknown> = { updatedAt: serverTimestamp() }
          if (a.done !== undefined) upd.done = a.done
          if (a.title) upd.title = a.title
          if (a.dueAt) {
            const due = new Date(a.dueAt)
            if (Number.isNaN(due.getTime())) throw new ApplyError('invalid time')
            upd.dueAt = Timestamp.fromDate(due)
          }
          await updateDoc(doc(remindersCol(uid), id), upd as never)
          if (a.title) addRef(opts.refs!, 'reminder', id, a.title)
          return { op: 'update', ref: a.ref }
        })
        break
      case 'note_update':
        await run('note', opts.refs?.entries[a.ref]?.title ?? a.ref, async () => {
          const { id } = target(a.ref, 'note')
          const fields: { title?: string; body?: string } = {}
          if (a.title) fields.title = a.title
          if (a.body) fields.body = a.body
          else if (a.append) {
            const snap = await getDoc(doc(notesCol(uid), id))
            if (!snap.exists()) throw new ApplyError('that note no longer exists')
            const cur = snap.data().body ?? ''
            fields.body = cur.trim() ? `${cur.trimEnd()}\n\n${a.append}` : a.append
          }
          await updateNote(uid, id, fields)
          if (a.title) addRef(opts.refs!, 'note', id, a.title)
          return { op: 'update', ref: a.ref }
        })
        break
      case 'goal_update':
        await run('goal', opts.refs?.entries[a.ref]?.title ?? a.ref, async () => {
          const { id } = target(a.ref, 'goal')
          const fields: { progress?: number; title?: string; milestones?: Milestone[] } = {}
          if (a.progress !== undefined) fields.progress = a.progress
          if (a.title) fields.title = a.title
          if (a.milestoneDone) {
            const snap = await getDoc(doc(goalsCol(uid), id))
            if (!snap.exists()) throw new ApplyError('that goal no longer exists')
            fields.milestones = applyMilestone(Array.isArray(snap.data().milestones) ? snap.data().milestones : [], a.milestoneDone)
          }
          await updateGoal(uid, id, fields)
          if (a.title) addRef(opts.refs!, 'goal', id, a.title)
          return { op: 'update', ref: a.ref }
        })
        break
      case 'meal_update':
        await run('health', opts.refs?.entries[a.ref]?.title ?? a.ref, async () => {
          const { id } = target(a.ref, 'meal')
          const snap = await getDoc(doc(mealsCol(uid), id))
          if (!snap.exists()) throw new ApplyError('that meal no longer exists')
          const ex = snap.data()
          let n = a.nutrition
          if (!n && a.description && a.totalCalories === undefined && opts.estimateMeal) n = await opts.estimateMeal(a.description, a.mealType ?? ex.mealType).catch(() => undefined)
          // A stated total replaces the items; a fresh estimate replaces both; otherwise calories stay as they were.
          const kcalPart =
            a.totalCalories !== undefined
              ? { items: [], totalCalories: a.totalCalories, estimated: false }
              : n
                ? { items: n.items, totalCalories: n.totalCalories, estimated: true }
                : { items: ex.items, totalCalories: ex.totalCalories, estimated: ex.estimated }
          await updateMeal(uid, id, { date: ex.date, mealType: a.mealType ?? ex.mealType, description: a.description ?? ex.description, source: ex.source, ...kcalPart })
          return { op: 'update', ref: a.ref, kcal: kcalPart.totalCalories }
        })
        break
      case 'reminder_delete':
      case 'note_delete':
      case 'goal_delete':
      case 'meal_delete': {
        const kind = a.type.replace('_delete', '') as RefKind
        const title = opts.refs?.entries[a.ref]?.title ?? a.ref
        await run(CATEGORY_OF[kind], title, async () => {
          const { id } = target(a.ref, kind)
          // Keep the data first so Undo can recreate the doc with the same id.
          const snap = await getDoc(doc(COL_OF[kind](uid), id))
          if (!snap.exists()) throw new ApplyError(`that ${kind} no longer exists`)
          await DELETE_OF[kind](uid, id)
          removeRef(opts.refs!, a.ref)
          opts.onDeleted?.({ kind, docId: id, title, data: snap.data() })
          return { op: 'delete' }
        })
        break
      }
      default:
        break
    }
  }
  if (res.memories.length) await run('memory', '2nd Brain memories', () => upsertMemories(uid, res.memories))
  return { saved, failed }
}

/** Undo a delete: recreate the doc with the same id and fields (createdAt/updatedAt re-stamped, see undo.ts). */
export async function restoreDeleted(uid: string, e: Pick<UndoEntry, 'kind' | 'docId' | 'data'>): Promise<void> {
  await setDoc(doc(COL_OF[e.kind](uid), e.docId), { ...restoreData(e.kind, e.data), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
}

/** Calls: calorie estimate for a described meal via POST /api/nutrition (friendly errors). */
export async function estimateMealViaApi(user: Pick<User, 'getIdToken'>, description: string, mealType?: EchoMealType, fetchImpl: typeof fetch = fetch): Promise<EchoNutrition> {
  const token = await user.getIdToken()
  const res = await fetchWithTimeout(
    '/api/nutrition',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ description, mealType }) },
    15000,
    fetchImpl,
  )
  if (!res.ok) throw new Error(res.status === 429 ? 'calorie estimates reached the free limit for now' : "couldn't estimate calories")
  const d = (await res.json()) as Partial<EchoNutrition>
  if (!Array.isArray(d.items) || typeof d.totalCalories !== 'number') throw new Error("couldn't estimate calories")
  return { items: d.items, totalCalories: d.totalCalories, estimated: true, grounded: d.grounded === true, ...(typeof d.assumptions === 'string' ? { assumptions: d.assumptions } : {}) }
}

const msOf = (t: unknown) => (t && typeof (t as Timestamp).toMillis === 'function' ? (t as Timestamp).toMillis() : 0)

/**
 * Live source data for the short-ref lists (open reminders, goals, recent notes, today's health and meals,
 * the calorie switch). Emits whenever any part changes; `day` is the local YYYY-MM-DD.
 */
export function watchRefSource(uid: string, day: string, onData: (src: RefSource) => void): () => void {
  const src: RefSource = { reminders: [], goals: [], notes: [], health: null, meals: [], caloriesEnabled: true }
  const emit = () => onData({ ...src })
  const warn = (what: string) => () => console.warn(`Echo: could not watch ${what}`)
  const subs = [
    onSnapshot(
      query(remindersCol(uid), where('dueAt', '>=', Timestamp.fromMillis(Date.now() - 36 * 3600e3)), orderBy('dueAt'), limit(60)),
      (snap) => {
        src.reminders = snap.docs.map((d) => ({ id: d.id, title: d.data().title, dueAtMs: msOf(d.data().dueAt), done: d.data().done }))
        emit()
      },
      warn('reminders'),
    ),
    onSnapshot(
      query(goalsCol(uid), limit(50)),
      (snap) => {
        src.goals = snap.docs.map((d) => {
          const g = d.data({ serverTimestamps: 'estimate' })
          return { id: d.id, title: g.title, progress: g.progress, milestones: g.milestones, updatedAtMs: msOf(g.updatedAt) }
        })
        emit()
      },
      warn('goals'),
    ),
    onSnapshot(
      query(notesCol(uid), orderBy('updatedAt', 'desc'), limit(10)),
      (snap) => {
        src.notes = snap.docs.map((d) => ({ id: d.id, title: d.data().title, updatedAtMs: msOf(d.data({ serverTimestamps: 'estimate' }).updatedAt) }))
        emit()
      },
      warn('notes'),
    ),
    onSnapshot(
      doc(healthLogsCol(uid), day),
      (snap) => {
        src.health = snap.exists() ? snap.data() : null
        emit()
      },
      warn('health'),
    ),
    mealsForDate(
      uid,
      day,
      (meals) => {
        src.meals = meals.map((m) => ({ id: m.id, mealType: m.mealType, description: m.description, totalCalories: m.totalCalories, createdAtMs: msOf(m.createdAt) }))
        emit()
      },
      warn('meals'),
    ),
    watchCalorieSettings(
      uid,
      (st) => {
        src.caloriesEnabled = st.enabled
        emit()
      },
      warn('calorie settings'),
    ),
  ]
  return () => subs.forEach((u) => u())
}

// Saves the assistant message; returns its id or undefined on failure.
export async function saveReply(uid: string, pageId: string, reply: string, category: EchoCategory): Promise<string | undefined> {
  try {
    return await addPageMessage(uid, pageId, 'assistant', reply, category)
  } catch (e) {
    console.error('Echo: could not save reply', e)
    return undefined
  }
}

// Applies actions and memories, then saves the assistant message last.
export async function applyEchoResponse(uid: string, pageId: string, res: EchoResponse, opts: ApplyOptions = {}): Promise<ApplyResult> {
  const { saved, failed } = await applyActions(uid, res, opts)
  const category = deriveCategory(saved)
  const reply = res.reply || fallbackReply(saved)
  let messageId: string | undefined
  if (reply) {
    messageId = await saveReply(uid, pageId, reply, category)
    if (!messageId) failed.push('reply')
  }
  return { saved, failed, category, reply, messageId }
}

/** Web search: asks the server for Tavily's login URL (POST /api/connectors/web-search/start). */
export async function startTavilyLogin(user: Pick<User, 'getIdToken'>, fetchImpl: typeof fetch = fetch): Promise<string> {
  const token = await user.getIdToken()
  const res = await fetchWithTimeout('/api/connectors/web-search/start', { method: 'POST', headers: { Authorization: `Bearer ${token}` } }, 15000, fetchImpl)
  const d = res.ok ? ((await res.json().catch(() => null)) as { url?: unknown } | null) : null
  if (typeof d?.url !== 'string') throw new Error(res.status === 401 ? 'Please sign in again.' : "Couldn't start the Tavily login. Try again.")
  return d.url
}

/** Web search: whether a login handed back in the URL fragment opens for this user (POST .../verify gives 204). */
export async function verifyTavilyLogin(user: Pick<User, 'getIdToken'>, sealed: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const token = await user.getIdToken()
  const res = await fetchWithTimeout(
    '/api/connectors/web-search/verify',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ sealed }) },
    15000,
    fetchImpl,
  )
  return res.status === 204
}

/** Web search: revokes the Tavily login (best effort; the caller clears the saved connector either way). */
export async function revokeTavilyLogin(user: Pick<User, 'getIdToken'>, sealed: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const token = await user.getIdToken()
  const res = await fetchWithTimeout(
    '/api/connectors/web-search/disconnect',
    { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ sealed }) },
    15000,
    fetchImpl,
  )
  if (!res.ok) throw new Error(`disconnect failed (${res.status})`)
}
