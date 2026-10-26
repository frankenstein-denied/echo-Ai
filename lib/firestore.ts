import type { User } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  deleteField,
  onSnapshot,
  where,
  type Unsubscribe,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { slugifyLabel } from '@/lib/echo/sanitize'
import { CONNECTORS, type ConnectorId } from '@/lib/echo/connectors'
import { BATCH_MAX, chunk, defaultPageTitle, MIGRATION_PAGE_ID, MIGRATION_PAGE_TITLE, normalizeTitle, planMigration, previewOf } from '@/lib/echo/diary'
import { buildReciprocalUpdate, mergeLinks, planReciprocalLinks } from '@/lib/echo/links'
import type { EchoCategory, MemoryInput, MemoryType } from '@/lib/echo/types'
import { validateMeal, type MealInput, type MealItem, type MealSource, type MealType, type MoodTag } from '@/lib/echo/health-helpers'

export type { EchoCategory, MemoryType, MealInput, MealItem, MealSource, MealType, MoodTag }

// Timestamps are read as Timestamp and written as serverTimestamp() (except reminder.dueAt).
export type UserProfile = {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  preferredName: string
  priorities: string[]
  yearGoals: string[]
  importantPeople: string[]
  tone: string
  checkInTime: string
  remindersEnabled: boolean
  onboarded: boolean
  caloriesEnabled?: boolean // absent means on
  calorieGoal?: number // 800-6000
  createdAt: Timestamp
  updatedAt: Timestamp
}
export type OnboardingAnswers = Pick<UserProfile, 'preferredName' | 'priorities' | 'yearGoals' | 'importantPeople' | 'tone' | 'checkInTime' | 'remindersEnabled'>
export type Note = { title: string; body: string; category: string; tags: string[]; createdAt: Timestamp; updatedAt: Timestamp }
export type Milestone = { text: string; done: boolean }
export type Goal = { title: string; category: string; progress: number; streak: number; milestones: Milestone[]; targetDate?: string; createdAt: Timestamp; updatedAt: Timestamp }
export type Energy = 'low' | 'medium' | 'high'
export type HealthLog = { date: string; mood: number; moodTag?: MoodTag; sleepMinutes: number; waterGlasses: number; energy: Energy; createdAt: Timestamp; updatedAt: Timestamp }
export type Meal = { date: string; mealType: MealType; description: string; items: MealItem[]; totalCalories: number; source: MealSource; estimated: boolean; createdAt: Timestamp; updatedAt: Timestamp }
export type ReminderSource = 'chat' | 'routine' | 'manual'
export type Reminder = { title: string; dueAt: Timestamp; done: boolean; source: ReminderSource; createdAt: Timestamp; updatedAt: Timestamp }
export type Routine = { title: string; cadence: string; confidence: number; createdAt: Timestamp; updatedAt: Timestamp }
export type Message = { role: 'user' | 'assistant'; text: string; category?: EchoCategory; createdAt: Timestamp }
export type DiaryPage = { title: string; preview: string; messageCount: number; createdAt: Timestamp; updatedAt: Timestamp; lastMessageAt: Timestamp }
export type Connector = { name: string; connected: boolean; updatedAt: Timestamp; sealed?: string }
export type Memory = { label: string; type: MemoryType; links: string[]; mentions: number; createdAt: Timestamp; lastSeenAt: Timestamp }

const sub = <T>(uid: string, name: string) => collection(db, 'users', uid, name) as CollectionReference<T>

export const userDoc = (uid: string) => doc(db, 'users', uid) as DocumentReference<UserProfile>
export const notesCol = (uid: string) => sub<Note>(uid, 'notes')
export const goalsCol = (uid: string) => sub<Goal>(uid, 'goals')
export const healthLogsCol = (uid: string) => sub<HealthLog>(uid, 'healthLogs')
export const mealsCol = (uid: string) => sub<Meal>(uid, 'meals')
export const remindersCol = (uid: string) => sub<Reminder>(uid, 'reminders')
export const routinesCol = (uid: string) => sub<Routine>(uid, 'routines')
export const messagesCol = (uid: string) => sub<Message>(uid, 'messages')
export const diaryPagesCol = (uid: string) => sub<DiaryPage>(uid, 'diaryPages')
export const pageMessagesCol = (uid: string, pageId: string) => collection(db, 'users', uid, 'diaryPages', pageId, 'messages') as CollectionReference<Message>
export const connectorsCol = (uid: string) => sub<Connector>(uid, 'connectors')
export const memoriesCol = (uid: string) => sub<Memory>(uid, 'memories')

export async function ensureUserProfile(user: User): Promise<UserProfile> {
  const ref = userDoc(user.uid)
  // Transaction makes read+create atomic so concurrent calls (StrictMode double effect) can't both create.
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref)
    if (snap.exists()) return snap.data()
    const base = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      preferredName: user.displayName || user.email?.split('@')[0] || '',
      priorities: [] as string[],
      yearGoals: [] as string[],
      importantPeople: [] as string[],
      tone: 'Gentle coach',
      checkInTime: '20:30',
      remindersEnabled: true,
      onboarded: false,
    }
    tx.set(ref, { ...base, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as unknown as UserProfile)
    const now = Timestamp.now()
    return { ...base, createdAt: now, updatedAt: now } as UserProfile
  })
}

export async function completeOnboarding(uid: string, answers: OnboardingAnswers): Promise<void> {
  const batch = writeBatch(db)
  batch.update(userDoc(uid), {
    preferredName: answers.preferredName,
    priorities: answers.priorities,
    yearGoals: answers.yearGoals,
    importantPeople: answers.importantPeople,
    tone: answers.tone,
    checkInTime: answers.checkInTime,
    remindersEnabled: answers.remindersEnabled,
    onboarded: true,
    updatedAt: serverTimestamp(),
  })
  for (const title of answers.yearGoals) {
    batch.set(doc(goalsCol(uid)), { title, category: 'Personal', progress: 0, streak: 0, milestones: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  }
  batch.set(doc(notesCol(uid)), {
    title: 'Welcome to Echo',
    body: 'This is your first note. Echo keeps your thoughts, goals and routines in one quiet place.',
    category: 'Diary',
    tags: ['welcome'],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as never)
  const [hh, mm] = answers.checkInTime.split(':').map(Number)
  const dueAt = new Date()
  dueAt.setHours(Number.isFinite(hh) ? hh : 20, Number.isFinite(mm) ? mm : 30, 0, 0)
  batch.set(doc(remindersCol(uid)), { title: 'Daily check-in', dueAt: Timestamp.fromDate(dueAt), done: false, source: 'routine', createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  batch.set(doc(routinesCol(uid)), { title: 'Daily check-in', cadence: 'Daily', confidence: 0.5, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  const connectors: [string, string][] = [['google-calendar', 'Google Calendar'], ['gmail', 'Gmail'], ['github', 'GitHub'], ['notion', 'Notion'], ['spotify', 'Spotify'], ['weather', 'Weather'], ['nutrition', 'Nutrition (USDA)'], ['web-search', 'Web search (Tavily)']]
  for (const [id, name] of connectors) {
    batch.set(doc(connectorsCol(uid), id), { name, connected: id === 'nutrition', updatedAt: serverTimestamp() } as never)
  }
  const welcome = `Nice to meet you, ${answers.preferredName || 'friend'}. What's on your mind?`
  const pageRef = doc(diaryPagesCol(uid))
  batch.set(pageRef, { title: defaultPageTitle(), preview: previewOf(welcome), messageCount: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessageAt: serverTimestamp() } as never)
  batch.set(doc(pageMessagesCol(uid, pageRef.id)), { role: 'assistant', text: welcome, createdAt: serverTimestamp() } as never)
  const seenPeople = new Set<string>()
  for (const label of answers.importantPeople) {
    const id = memoryId('person', label)
    if (seenPeople.has(id)) continue
    seenPeople.add(id)
    batch.set(doc(memoriesCol(uid), id), { label, type: 'person', links: [], mentions: 1, createdAt: serverTimestamp(), lastSeenAt: serverTimestamp() } as never)
  }
  await batch.commit()
}

export async function setConnectorConnected(uid: string, id: string, name: string, connected: boolean): Promise<void> {
  await setDoc(doc(connectorsCol(uid), id), { name, connected, updatedAt: serverTimestamp() } as never)
}

/** Web search login: saves the sealed tokens (connected) or, with null, disconnects and drops them. Replaces the doc. */
export async function setConnectorSecret(uid: string, id: ConnectorId, sealed: string | null): Promise<void> {
  const name = CONNECTORS.find((c) => c.id === id)?.name ?? id
  await setDoc(doc(connectorsCol(uid), id), (sealed ? { name, connected: true, sealed, updatedAt: serverTimestamp() } : { name, connected: false, updatedAt: serverTimestamp() }) as never)
}

export async function addNote(uid: string, note: Pick<Note, 'title' | 'body' | 'category' | 'tags'>): Promise<string> {
  const ref = doc(notesCol(uid))
  await setDoc(ref, { title: note.title, body: note.body, category: note.category, tags: note.tags, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  return ref.id
}

export async function addGoal(uid: string, goal: Pick<Goal, 'title' | 'category' | 'targetDate'>): Promise<string> {
  const ref = doc(goalsCol(uid))
  await setDoc(ref, { title: goal.title, category: goal.category, progress: 0, streak: 0, milestones: [], ...(goal.targetDate ? { targetDate: goal.targetDate } : {}), createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  return ref.id
}

export async function addReminder(uid: string, r: { title: string; dueAt: Date; source: ReminderSource }): Promise<string> {
  const ref = doc(remindersCol(uid))
  await setDoc(ref, { title: r.title, dueAt: Timestamp.fromDate(r.dueAt), done: false, source: r.source, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  return ref.id
}

// ---------- diary pages ----------
export async function createDiaryPage(uid: string, title?: string): Promise<string> {
  const ref = doc(diaryPagesCol(uid))
  await setDoc(ref, { title: normalizeTitle(title ?? '') ?? defaultPageTitle(), preview: '', messageCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), lastMessageAt: serverTimestamp() } as never)
  return ref.id
}

export async function renameDiaryPage(uid: string, pageId: string, title: string): Promise<void> {
  const t = normalizeTitle(title)
  if (!t) throw new Error('Title must be 1-120 characters.')
  await updateDoc(doc(diaryPagesCol(uid), pageId), { title: t, updatedAt: serverTimestamp() } as never)
}

// Deletes the page doc first (so no new message can be added through the UI), then sweeps its messages in
// batches of <= 400, re-querying until empty so a send that was in flight cannot leave orphans.
// Notes, goals etc. are untouched.
export async function deleteDiaryPage(uid: string, pageId: string): Promise<void> {
  await deleteDoc(doc(diaryPagesCol(uid), pageId))
  for (let round = 0; round < 5; round++) {
    const snap = await getDocs(pageMessagesCol(uid, pageId))
    if (snap.empty) return
    for (const refs of chunk(snap.docs.map((d) => d.ref), BATCH_MAX)) {
      const batch = writeBatch(db)
      for (const r of refs) batch.delete(r)
      await batch.commit()
    }
  }
}

// One batch: the message plus the page's preview, count and timestamps.
export async function addPageMessage(uid: string, pageId: string, role: Message['role'], text: string, category?: EchoCategory): Promise<string> {
  const ref = doc(pageMessagesCol(uid, pageId))
  const batch = writeBatch(db)
  batch.set(ref, { role, text, ...(category ? { category } : {}), createdAt: serverTimestamp() } as never)
  batch.update(doc(diaryPagesCol(uid), pageId), { preview: previewOf(text), messageCount: increment(1), updatedAt: serverTimestamp(), lastMessageAt: serverTimestamp() } as never)
  await batch.commit()
  return ref.id
}

// One-time, re-runnable move of the old flat messages into the "Earlier entries" page.
// Order: copy (same ids, skipping ones already copied) -> create page if missing (transaction) -> delete old docs.
// One run per uid per session; a failed copy batch re-reads what exists and retries only the missing ids, so a
// concurrent run (another tab) that already copied them is not mistaken for a rules error.
const migrations = new Map<string, Promise<boolean>>()

export function migrateFlatMessages(uid: string): Promise<boolean> {
  let p = migrations.get(uid)
  if (!p) {
    p = runMigration(uid)
    migrations.set(uid, p)
    p.catch(() => migrations.delete(uid)) // allow a retry after a real failure
  }
  return p
}

async function runMigration(uid: string): Promise<boolean> {
  const old = await getDocs(query(messagesCol(uid), orderBy('createdAt')))
  if (old.empty) return false
  const pageId = MIGRATION_PAGE_ID
  const target = pageMessagesCol(uid, pageId)
  const oldIds = old.docs.map((d) => d.id)
  const existingIds = async () => (await getDocs(target)).docs.map((d) => d.id)
  const plan = planMigration(oldIds, await existingIds())
  const byId = new Map(old.docs.map((d) => [d.id, d]))
  for (const ids of plan.copyBatches) {
    const write = async (list: string[]) => {
      const batch = writeBatch(db)
      for (const id of list) {
        const m = byId.get(id)!.data()
        batch.set(doc(target, id), { role: m.role, text: m.text, ...(m.category ? { category: m.category } : {}), createdAt: m.createdAt } as never)
      }
      await batch.commit()
    }
    try {
      await write(ids)
    } catch (e) {
      const have = new Set(await existingIds())
      const missing = ids.filter((id) => !have.has(id))
      if (missing.length) await write(missing).catch(() => { throw e })
    }
  }
  const pageRef = doc(diaryPagesCol(uid), pageId)
  const last = old.docs[old.docs.length - 1].data()
  try {
    await runTransaction(db, async (tx) => {
      if ((await tx.get(pageRef)).exists()) return
      tx.set(pageRef, { title: MIGRATION_PAGE_TITLE, preview: previewOf(last.text), messageCount: plan.total, createdAt: serverTimestamp(), updatedAt: last.createdAt, lastMessageAt: last.createdAt } as never)
    })
  } catch (e) {
    if (!(await getDoc(pageRef)).exists()) throw e // only a real failure if the page still does not exist
  }
  for (const ids of plan.deleteBatches) {
    const batch = writeBatch(db)
    for (const id of ids) batch.delete(byId.get(id)!.ref)
    await batch.commit()
  }
  return true
}

// date is YYYY-MM-DD and is the doc id. Creates with createdAt, otherwise updates only the given fields.
export async function upsertHealthLog(uid: string, date: string, fields: Partial<Pick<HealthLog, 'mood' | 'moodTag' | 'sleepMinutes' | 'waterGlasses' | 'energy'>>): Promise<void> {
  const ref = doc(healthLogsCol(uid), date)
  const snap = await getDoc(ref)
  if (snap.exists()) await updateDoc(ref, { ...fields, updatedAt: serverTimestamp() })
  else await setDoc(ref, { ...fields, date, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
}

// Saves Health-form changes. Water is a delta so a stale form can never overwrite a value Echo logged:
// existing doc -> increment(delta) (clamped so the result stays >= 0); new doc -> concrete number.
export async function saveHealthChanges(
  uid: string,
  date: string,
  fields: Partial<Pick<HealthLog, 'mood' | 'moodTag' | 'sleepMinutes' | 'energy'>>,
  waterDelta = 0,
): Promise<void> {
  const ref = doc(healthLogsCol(uid), date)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const upd: Record<string, unknown> = { ...fields, updatedAt: serverTimestamp() }
    if (waterDelta) {
      const cur = snap.data().waterGlasses ?? 0
      upd.waterGlasses = cur + waterDelta < 0 ? 0 : increment(waterDelta)
    }
    await updateDoc(ref, upd as never)
  } else {
    const data: Record<string, unknown> = { ...fields, date, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }
    if (waterDelta) data.waterGlasses = Math.max(0, waterDelta)
    await setDoc(ref, data as never)
  }
}

// ---------- edit helpers (every write stamps updatedAt and never touches createdAt) ----------
export async function updateNote(uid: string, id: string, fields: Partial<Pick<Note, 'title' | 'body' | 'tags' | 'category'>>): Promise<void> {
  await updateDoc(doc(notesCol(uid), id), { ...fields, updatedAt: serverTimestamp() } as never)
}

export async function deleteNote(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(notesCol(uid), id))
}

export async function updateGoal(uid: string, id: string, fields: Partial<Pick<Goal, 'progress' | 'milestones' | 'title'>>): Promise<void> {
  await updateDoc(doc(goalsCol(uid), id), { ...fields, updatedAt: serverTimestamp() } as never)
}

export async function deleteGoal(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(goalsCol(uid), id))
}

export async function setReminderDone(uid: string, id: string, done: boolean): Promise<void> {
  await updateDoc(doc(remindersCol(uid), id), { done, updatedAt: serverTimestamp() } as never)
}

export async function deleteReminder(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(remindersCol(uid), id))
}

// Memory doc id = <type>-<slug(label)>; matches the router's dedupe keys.
export function memoryId(type: MemoryType, label: string): string {
  return `${type}-${slugifyLabel(label) || 'unnamed'}`
}

// Creates each memory (mentions: 1) or bumps mentions and merges links, and adds reciprocal links
// (B also lists A) to existing targets without touching their mentions. All reads happen before any write.
export async function upsertMemories(uid: string, inputs: MemoryInput[]): Promise<void> {
  const byId = new Map<string, MemoryInput>()
  for (const m of inputs) {
    if (!slugifyLabel(m.label)) continue
    const id = memoryId(m.type, m.label)
    if (!byId.has(id)) byId.set(id, m)
  }
  if (!byId.size) return
  const linksOf = (id: string) => (byId.get(id)?.linkIds ?? []).filter((t) => t !== id)
  const reciprocal = planReciprocalLinks([...byId.keys()].map((id) => ({ id, linkIds: linksOf(id) })))
  const externalIds = [...reciprocal.keys()].filter((id) => !byId.has(id))
  await runTransaction(db, async (tx) => {
    const entries = [...byId.entries()].map(([id, m]) => ({ id, m, ref: doc(memoriesCol(uid), id) }))
    const externals = externalIds.map((id) => ({ id, ref: doc(memoriesCol(uid), id) }))
    const [snaps, extSnaps] = await Promise.all([
      Promise.all(entries.map((e) => tx.get(e.ref))),
      Promise.all(externals.map((e) => tx.get(e.ref))),
    ])
    const existingExternal = new Set(externals.filter((_, i) => extSnaps[i].exists()).map((e) => e.id))
    entries.forEach((e, i) => {
      const snap = snaps[i]
      // Drop targets that no longer exist (stale context) so links never dangle.
      const links = linksOf(e.id).filter((t) => byId.has(t) || existingExternal.has(t))
      const withBack = [...links, ...(reciprocal.get(e.id) ?? [])]
      if (snap.exists()) {
        const merged = mergeLinks(snap.data().links ?? [], withBack)
        tx.update(e.ref, { mentions: increment(1), links: merged, lastSeenAt: serverTimestamp() } as never)
      } else {
        tx.set(e.ref, { label: e.m.label, type: e.m.type, links: mergeLinks([], withBack), mentions: 1, createdAt: serverTimestamp(), lastSeenAt: serverTimestamp() } as never)
      }
    })
    externals.forEach((e, i) => {
      const snap = extSnaps[i]
      if (!snap.exists()) return
      const upd = buildReciprocalUpdate(snap.data(), reciprocal.get(e.id) ?? [])
      if (!upd) return
      // Rules require lastSeenAt == request.time on every update (so it is bumped); mentions is only set for legacy docs lacking it.
      tx.update(e.ref, { ...upd, lastSeenAt: serverTimestamp() } as never)
    })
  })
}

// ---------- profile settings ----------
// calorieGoal: a number sets it, null removes it. Rules require updatedAt == request.time and a valid whole profile.
export async function updateCalorieSettings(uid: string, s: { caloriesEnabled?: boolean; calorieGoal?: number | null }): Promise<void> {
  const upd: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (s.caloriesEnabled !== undefined) upd.caloriesEnabled = s.caloriesEnabled
  if (s.calorieGoal !== undefined) upd.calorieGoal = s.calorieGoal === null ? deleteField() : s.calorieGoal
  await updateDoc(userDoc(uid), upd as never)
}

// Live profile calorie settings; caloriesEnabled defaults to true when absent.
export function watchCalorieSettings(uid: string, onData: (s: { enabled: boolean; goal?: number }) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    userDoc(uid),
    (snap) => {
      const d = snap.data()
      onData({ enabled: d?.caloriesEnabled !== false, goal: typeof d?.calorieGoal === 'number' ? d.calorieGoal : undefined })
    },
    onError,
  )
}

// ---------- meals (users/{uid}/meals/{id}) ----------
// Input is validated and sanitised client-side (rules cannot check item shapes). Throws Error(message) when invalid.
type MealFields = { date?: string; mealType?: MealType; description?: string; items?: unknown; totalCalories?: unknown; source?: MealSource; estimated?: boolean }

export async function addMeal(uid: string, input: MealFields): Promise<string> {
  const check = validateMeal(input)
  if (!check.ok) throw new Error(check.error)
  const ref = doc(mealsCol(uid))
  await setDoc(ref, { ...check.value, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  return ref.id
}

// Rewrites the editable fields; createdAt is untouched. Pass the stored date and source to keep them.
export async function updateMeal(uid: string, id: string, input: MealFields): Promise<void> {
  const check = validateMeal(input)
  if (!check.ok) throw new Error(check.error)
  await updateDoc(doc(mealsCol(uid), id), { ...check.value, updatedAt: serverTimestamp() } as never)
}

export async function deleteMeal(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(mealsCol(uid), id))
}

export type MealDoc = Meal & { id: string }

// Live meals whose date is in [from, to] (YYYY-MM-DD, inclusive). Single-field range: no composite index needed.
export function mealsInRange(uid: string, from: string, to: string, onData: (meals: MealDoc[]) => void, onError: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(mealsCol(uid), where('date', '>=', from), where('date', '<=', to)),
    (snap) => onData(snap.docs.map((d) => ({ ...d.data(), id: d.id })).sort((a, b) => (a.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) - (b.createdAt?.toMillis?.() ?? Number.MAX_SAFE_INTEGER))),
    onError,
  )
}

export function mealsForDate(uid: string, date: string, onData: (meals: MealDoc[]) => void, onError: (e: Error) => void): Unsubscribe {
  return mealsInRange(uid, date, date, onData, onError)
}
