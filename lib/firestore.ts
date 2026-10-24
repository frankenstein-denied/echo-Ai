import type { User } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
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
  createdAt: Timestamp
  updatedAt: Timestamp
}
export type OnboardingAnswers = Pick<UserProfile, 'preferredName' | 'priorities' | 'yearGoals' | 'importantPeople' | 'tone' | 'checkInTime' | 'remindersEnabled'>
export type Note = { title: string; body: string; category: string; tags: string[]; createdAt: Timestamp; updatedAt: Timestamp }
export type Milestone = { text: string; done: boolean }
export type Goal = { title: string; category: string; progress: number; streak: number; milestones: Milestone[]; createdAt: Timestamp; updatedAt: Timestamp }
export type Energy = 'low' | 'medium' | 'high'
export type HealthLog = { date: string; mood: number; sleepMinutes: number; waterGlasses: number; energy: Energy; createdAt: Timestamp; updatedAt: Timestamp }
export type ReminderSource = 'chat' | 'routine' | 'manual'
export type Reminder = { title: string; dueAt: Timestamp; done: boolean; source: ReminderSource; createdAt: Timestamp; updatedAt: Timestamp }
export type Routine = { title: string; cadence: string; confidence: number; createdAt: Timestamp; updatedAt: Timestamp }
export type Message = { role: 'user' | 'assistant'; text: string; createdAt: Timestamp }
export type Connector = { name: string; connected: boolean; updatedAt: Timestamp }
export type MemoryType = 'diary' | 'task' | 'goal' | 'health' | 'person' | 'connector'
export type Memory = { label: string; type: MemoryType; links: string[]; createdAt: Timestamp }

const sub = <T>(uid: string, name: string) => collection(db, 'users', uid, name) as CollectionReference<T>

export const userDoc = (uid: string) => doc(db, 'users', uid) as DocumentReference<UserProfile>
export const notesCol = (uid: string) => sub<Note>(uid, 'notes')
export const goalsCol = (uid: string) => sub<Goal>(uid, 'goals')
export const healthLogsCol = (uid: string) => sub<HealthLog>(uid, 'healthLogs')
export const remindersCol = (uid: string) => sub<Reminder>(uid, 'reminders')
export const routinesCol = (uid: string) => sub<Routine>(uid, 'routines')
export const messagesCol = (uid: string) => sub<Message>(uid, 'messages')
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
  const connectors: [string, string][] = [['google-calendar', 'Google Calendar'], ['gmail', 'Gmail'], ['github', 'GitHub'], ['notion', 'Notion'], ['spotify', 'Spotify'], ['weather', 'Weather']]
  for (const [id, name] of connectors) {
    batch.set(doc(connectorsCol(uid), id), { name, connected: false, updatedAt: serverTimestamp() } as never)
  }
  batch.set(doc(messagesCol(uid)), { role: 'assistant', text: `Nice to meet you, ${answers.preferredName || 'friend'}. What's on your mind?`, createdAt: serverTimestamp() } as never)
  for (const label of answers.importantPeople) {
    batch.set(doc(memoriesCol(uid)), { label, type: 'person', links: [], createdAt: serverTimestamp() } as never)
  }
  await batch.commit()
}

export async function addNote(uid: string, note: Pick<Note, 'title' | 'body' | 'category' | 'tags'>): Promise<string> {
  const ref = doc(notesCol(uid))
  await setDoc(ref, { title: note.title, body: note.body, category: note.category, tags: note.tags, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  return ref.id
}

export async function addGoal(uid: string, goal: Pick<Goal, 'title' | 'category'>): Promise<string> {
  const ref = doc(goalsCol(uid))
  await setDoc(ref, { title: goal.title, category: goal.category, progress: 0, streak: 0, milestones: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  return ref.id
}

export async function addReminder(uid: string, r: { title: string; dueAt: Date; source: ReminderSource }): Promise<string> {
  const ref = doc(remindersCol(uid))
  await setDoc(ref, { title: r.title, dueAt: Timestamp.fromDate(r.dueAt), done: false, source: r.source, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
  return ref.id
}

export async function addMessage(uid: string, role: Message['role'], text: string): Promise<string> {
  const ref = doc(messagesCol(uid))
  await setDoc(ref, { role, text, createdAt: serverTimestamp() } as never)
  return ref.id
}

// date is YYYY-MM-DD and is the doc id. Creates with createdAt, otherwise updates only the given fields.
export async function upsertHealthLog(uid: string, date: string, fields: Partial<Pick<HealthLog, 'mood' | 'sleepMinutes' | 'waterGlasses' | 'energy'>>): Promise<void> {
  const ref = doc(healthLogsCol(uid), date)
  const snap = await getDoc(ref)
  if (snap.exists()) await updateDoc(ref, { ...fields, updatedAt: serverTimestamp() })
  else await setDoc(ref, { ...fields, date, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } as never)
}
