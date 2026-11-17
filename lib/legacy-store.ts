import type { User } from 'firebase/auth'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type CollectionReference,
  type DocumentReference,
  type Unsubscribe,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import {
  DEMO_MINUTES,
  hashAnswer,
  isValidAnswer,
  LEGACY_KINDS,
  legacyLinkId,
  MAX_RELEASE_MINUTES,
  MAX_TRIES,
  memoryTypesFor,
  questionText,
  activityThrottleMs,
  runActivityStamp,
  TRY_WINDOW_MS,
  type LegacyKind,
} from '@/lib/echo/legacy'
import type { VoiceNickname, VoiceProfile } from '@/lib/echo/legacy-prompt'
import { isValidEmail, normalizeEmail, validateNewInheritor, type NewInheritorError } from '@/lib/echo/legacy-validate'
import type { DiaryPage, Goal, HealthLog, Meal, Memory, Note, UserProfile } from '@/lib/firestore'

// Paths and field sets mirror firestore.rules exactly; every stamp is serverTimestamp().

export type LegacySettings = { enabled: boolean; releaseAfterMinutes: number; lastActiveAt: Timestamp; createdAt: Timestamp; updatedAt: Timestamp }
export type LegacyBeacon = { ownerName: string; updatedAt: Timestamp }
export type LegacyProfile = { displayName: string | null; preferredName: string; importantPeople: string[]; tone: string; language: string | null; updatedAt: Timestamp }
export type LegacyNickname = VoiceNickname
/** The stored voice doc: VoiceProfile (lib/echo/legacy-prompt) with a nullable language and a Timestamp builtAt. */
export type LegacyVoice = Omit<VoiceProfile, 'language' | 'builtAt'> & { language: string | null; builtAt: Timestamp }
export type LegacyStatus = 'pending' | 'accepted'
export type LegacyLinkDoc = {
  ownerUid: string
  inheritorUid: string
  ownerName: string | null
  inheritorName: string | null
  inheritorEmail: string
  status: LegacyStatus
  questionId: string
  shared: LegacyKind[]
  createdAt: Timestamp
  updatedAt: Timestamp
}
/** `attempt` is filled for the owner's view only: tries in the current window and whether the last guess was wrong. */
export type LegacyLink = LegacyLinkDoc & { id: string; attempt?: { count: number; wrong: boolean } }
export type LegacyAttempt = { count: number; windowStart: Timestamp; guessHash: string; lastAt: Timestamp }
export type LegacyChatMessage = { role: 'user' | 'assistant'; text: string; createdAt: Timestamp }
export type WithId<T> = T & { id: string }
export type SharedLegacy = {
  profile: LegacyProfile | null
  voice: LegacyVoice | null
  memories: WithId<Memory>[]
  goals: WithId<Goal>[]
  notes: WithId<Note>[]
  pages: WithId<DiaryPage>[]
  health: { logs: WithId<HealthLog>[]; meals: WithId<Meal>[] }
}

const legacyDoc = <T>(uid: string, name: 'settings' | 'beacon' | 'profile' | 'voice') =>
  doc(db, 'users', uid, 'legacy', name) as DocumentReference<T>
export const legacySettingsDoc = (uid: string) => legacyDoc<LegacySettings>(uid, 'settings')
export const legacyBeaconDoc = (uid: string) => legacyDoc<LegacyBeacon>(uid, 'beacon')
export const legacyProfileDoc = (uid: string) => legacyDoc<LegacyProfile>(uid, 'profile')
export const legacyVoiceDoc = (uid: string) => legacyDoc<LegacyVoice>(uid, 'voice')
export const directoryDoc = (email: string) => doc(db, 'userDirectory', normalizeEmail(email)) as DocumentReference<{ uid: string; displayName: string | null }>
export const legacyLinksCol = () => collection(db, 'legacyLinks') as CollectionReference<LegacyLinkDoc>
export const legacyLinkDoc = (linkId: string) => doc(db, 'legacyLinks', linkId) as DocumentReference<LegacyLinkDoc>
export const legacySecretDoc = (linkId: string) => doc(db, 'legacySecrets', linkId) as DocumentReference<{ answerHash: string }>
export const legacyAttemptDoc = (linkId: string) => doc(db, 'legacyAttempts', linkId) as DocumentReference<LegacyAttempt>
export const legacyChatCol = (inheritorUid: string, ownerUid: string) =>
  collection(db, 'users', inheritorUid, 'legacyChats', ownerUid, 'messages') as CollectionReference<LegacyChatMessage>
const userDocRef = (uid: string) => doc(db, 'users', uid) as DocumentReference<UserProfile>
const ownerSub = <T>(uid: string, name: string) => collection(db, 'users', uid, name) as CollectionReference<T>

function isDenied(e: unknown): boolean {
  return (e as { code?: string } | null)?.code === 'permission-denied'
}

/** Keeps only known share kinds, once each, in the canonical order. */
function cleanShared(shared: LegacyKind[]): LegacyKind[] {
  return LEGACY_KINDS.filter(k => shared.includes(k))
}

// ---------- directory ----------

/** Lets others find this user by email. Skipped unless the email is verified (the rules require it). */
export async function upsertDirectoryEntry(user: User): Promise<void> {
  if (!user.email || !user.emailVerified) return
  await setDoc(directoryDoc(user.email), { uid: user.uid, displayName: user.displayName?.slice(0, 200) ?? null })
}

export async function lookupInheritor(email: string): Promise<{ uid: string; displayName: string } | null> {
  if (!isValidEmail(email)) return null
  const snap = await getDoc(directoryDoc(email))
  if (!snap.exists()) return null
  const d = snap.data()
  return { uid: d.uid, displayName: d.displayName ?? '' }
}

// ---------- settings, beacon, profile copy ----------

/** The owner's release period, remembered for this page so stamping can keep up with short (demo) periods. */
const releaseMinutesByUid = new Map<string, number>()

export async function getLegacySettings(uid: string): Promise<LegacySettings | null> {
  const snap = await getDoc(legacySettingsDoc(uid))
  const s = snap.exists() ? snap.data() : null
  if (s && typeof s.releaseAfterMinutes === 'number') releaseMinutesByUid.set(uid, s.releaseAfterMinutes)
  return s
}

/** The safe fields of the owner's profile that an unlocked inheritor may read. */
export async function writeLegacyProfile(uid: string, profile: Pick<UserProfile, 'displayName' | 'preferredName' | 'importantPeople' | 'tone' | 'language'>): Promise<void> {
  await setDoc(legacyProfileDoc(uid), legacyProfileFields(profile) as never)
}

function legacyProfileFields(p: Partial<Pick<UserProfile, 'displayName' | 'preferredName' | 'importantPeople' | 'tone' | 'language'>>) {
  return {
    displayName: p.displayName?.slice(0, 200) ?? null,
    preferredName: (p.preferredName ?? '').slice(0, 200),
    importantPeople: (p.importantPeople ?? []).slice(0, 100),
    tone: (p.tone ?? '').slice(0, 100),
    language: p.language?.slice(0, 20) ?? null,
    updatedAt: serverTimestamp(),
  }
}

/**
 * Saves the owner's choice and refreshes the beacon and profile copy in one batch.
 * Every settings write stamps lastActiveAt (the rules require it), so saving counts as activity.
 */
export async function saveLegacySettings(uid: string, s: { enabled: boolean; releaseAfterMinutes: number }): Promise<void> {
  if (!Number.isInteger(s.releaseAfterMinutes) || s.releaseAfterMinutes < DEMO_MINUTES || s.releaseAfterMinutes > MAX_RELEASE_MINUTES) {
    throw new Error(`releaseAfterMinutes must be a whole number from ${DEMO_MINUTES} to ${MAX_RELEASE_MINUTES}`)
  }
  const [existing, profileSnap] = await Promise.all([getDoc(legacySettingsDoc(uid)), getDoc(userDocRef(uid))])
  const profile = profileSnap.exists() ? profileSnap.data() : null
  const b = writeBatch(db)
  const fields = { enabled: s.enabled, releaseAfterMinutes: s.releaseAfterMinutes, lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() }
  if (existing.exists()) b.update(legacySettingsDoc(uid), fields as never)
  else b.set(legacySettingsDoc(uid), { ...fields, createdAt: serverTimestamp() } as never)
  const ownerName = (profile?.preferredName || profile?.displayName || '').slice(0, 200)
  b.set(legacyBeaconDoc(uid), { ownerName, updatedAt: serverTimestamp() } as never)
  if (profile) b.set(legacyProfileDoc(uid), legacyProfileFields(profile) as never)
  await b.commit()
  releaseMinutesByUid.set(uid, s.releaseAfterMinutes)
}

const stampKey = (uid: string) => `echo.legacy.lastStamp.${uid}`

function readStamp(uid: string): number | null {
  try {
    const v = Number(globalThis.localStorage?.getItem(stampKey(uid)))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

function writeStamp(uid: string, ms: number | null): void {
  try {
    if (ms === null) globalThis.localStorage?.removeItem(stampKey(uid))
    else globalThis.localStorage?.setItem(stampKey(uid), String(ms))
  } catch {
    // Storage blocked: we just stamp more often.
  }
}

/**
 * Marks the owner active, at most once an hour (or twice per release period when that is shorter).
 * Silent when Legacy was never set up; never throws.
 */
export async function stampActivity(uid: string): Promise<void> {
  await runActivityStamp({
    readStamp: () => readStamp(uid),
    writeStamp: (ms) => writeStamp(uid, ms),
    write: () => updateDoc(legacySettingsDoc(uid), { lastActiveAt: serverTimestamp(), updatedAt: serverTimestamp() } as never),
    nowMs: Date.now(),
    throttleMs: activityThrottleMs(releaseMinutesByUid.get(uid)),
  })
}

// ---------- links (owner side) ----------

export type AddInheritorError = NewInheritorError | 'exists'

export async function addInheritor(
  owner: User,
  input: { email: string; questionId: string; answer: string; shared: LegacyKind[] },
): Promise<{ ok: true } | { ok: false; error: AddInheritorError }> {
  if (!isValidEmail(input.email)) return { ok: false, error: 'email' }
  const [found, mine] = await Promise.all([
    lookupInheritor(input.email),
    getDocs(query(legacyLinksCol(), where('ownerUid', '==', owner.uid))),
  ])
  const check = validateNewInheritor({
    ownerUid: owner.uid,
    ownerEmail: owner.email,
    email: input.email,
    questionId: input.questionId,
    answer: input.answer,
    existingCount: mine.size,
    found,
  })
  if (!check.ok) return check
  const inheritor = found!
  if (mine.docs.some(d => d.data().inheritorUid === inheritor.uid)) return { ok: false, error: 'exists' }

  const linkId = legacyLinkId(owner.uid, inheritor.uid)
  const answerHash = await hashAnswer(linkId, input.answer)
  const b = writeBatch(db)
  // A stale attempts doc (from someone who left) would carry over a correct guess.
  b.delete(legacyAttemptDoc(linkId))
  b.set(legacyLinkDoc(linkId), {
    ownerUid: owner.uid,
    inheritorUid: inheritor.uid,
    ownerName: owner.displayName?.slice(0, 200) ?? null,
    inheritorName: inheritor.displayName ? inheritor.displayName.slice(0, 200) : null,
    inheritorEmail: normalizeEmail(input.email),
    status: 'pending',
    questionId: input.questionId,
    shared: cleanShared(input.shared),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as never)
  b.set(legacySecretDoc(linkId), { answerHash })
  await b.commit()
  return { ok: true }
}

/** A new question needs a new answer; any new answer replaces the secret and wipes old guesses. */
export async function updateInheritor(
  ownerUid: string,
  inheritorUid: string,
  patch: { questionId?: string; answer?: string; shared?: LegacyKind[] },
): Promise<{ ok: true } | { ok: false; error: 'question' | 'answer' }> {
  if (patch.questionId !== undefined && questionText(patch.questionId) === null) return { ok: false, error: 'question' }
  if (patch.questionId !== undefined && patch.answer === undefined) return { ok: false, error: 'answer' }
  if (patch.answer !== undefined && !isValidAnswer(patch.answer)) return { ok: false, error: 'answer' }

  const linkId = legacyLinkId(ownerUid, inheritorUid)
  const b = writeBatch(db)
  const linkFields: Record<string, unknown> = {}
  if (patch.questionId !== undefined) linkFields.questionId = patch.questionId
  if (patch.shared !== undefined) linkFields.shared = cleanShared(patch.shared)
  if (Object.keys(linkFields).length) b.update(legacyLinkDoc(linkId), { ...linkFields, updatedAt: serverTimestamp() } as never)
  if (patch.answer !== undefined) {
    b.set(legacySecretDoc(linkId), { answerHash: await hashAnswer(linkId, patch.answer) })
    b.delete(legacyAttemptDoc(linkId))
  }
  await b.commit()
  return { ok: true }
}

export async function removeInheritor(ownerUid: string, inheritorUid: string): Promise<void> {
  const linkId = legacyLinkId(ownerUid, inheritorUid)
  const b = writeBatch(db)
  b.delete(legacyLinkDoc(linkId))
  b.delete(legacySecretDoc(linkId))
  b.delete(legacyAttemptDoc(linkId))
  await b.commit()
}

// ---------- links (inheritor side) ----------

export async function respondToRequest(linkId: string, accept: boolean): Promise<void> {
  if (accept) await updateDoc(legacyLinkDoc(linkId), { status: 'accepted', updatedAt: serverTimestamp() } as never)
  else await deleteDoc(legacyLinkDoc(linkId))
}

/** The inheritor steps away; the owner's secret and any attempts stay until the owner removes or re-adds. */
export async function leaveLegacy(linkId: string): Promise<void> {
  await deleteDoc(legacyLinkDoc(linkId))
}

// ---------- watching links ----------

/** Owner view: each link plus tries in the current window and whether the last guess was wrong. */
export function watchMyInheritors(uid: string, cb: (links: LegacyLink[]) => void, onError?: (e: Error) => void): Unsubscribe {
  let seq = 0
  return onSnapshot(
    query(legacyLinksCol(), where('ownerUid', '==', uid)),
    (snap) => {
      const mine = ++seq
      const links = snap.docs.map(d => ({ ...d.data(), id: d.id }))
      void Promise.all(links.map(async (link): Promise<LegacyLink> => {
        try {
          const [attempt, secret] = await Promise.all([getDoc(legacyAttemptDoc(link.id)), getDoc(legacySecretDoc(link.id))])
          if (!attempt.exists()) return link
          const a = attempt.data()
          return { ...link, attempt: { count: a.count, wrong: a.guessHash !== (secret.exists() ? secret.data().answerHash : undefined) } }
        } catch {
          return link
        }
      })).then(full => { if (mine === seq) cb(full) })
    },
    (e) => onError?.(e),
  )
}

/** Inheritor view: the legacies this user was named in. */
export function watchMyLegacies(uid: string, cb: (links: LegacyLink[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(legacyLinksCol(), where('inheritorUid', '==', uid)),
    (snap) => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
    (e) => onError?.(e),
  )
}

// ---------- release and guesses ----------

/** The beacon is readable only by an accepted inheritor while the owner is released. */
export async function isReleased(ownerUid: string): Promise<boolean> {
  try {
    return (await getDoc(legacyBeaconDoc(ownerUid))).exists()
  } catch (e) {
    if (isDenied(e)) return false
    throw e
  }
}

/**
 * Whether this inheritor can still read the owner's legacy (the profile copy). False when the rules deny it:
 * a wrong stored guess, or the owner came back and the legacy locked again. Other errors are thrown.
 */
export async function canReadLegacy(ownerUid: string): Promise<boolean> {
  try {
    await getDoc(legacyProfileDoc(ownerUid))
    return true
  } catch (e) {
    if (isDenied(e)) return false
    throw e
  }
}

/**
 * Every guess is a counted write; the write never says if it was right. Afterwards the profile
 * copy is readable only when the stored guess matches the answer, which is how we learn the result.
 */
export async function submitGuess(
  ownerUid: string,
  inheritorUid: string,
  answer: string,
): Promise<{ correct: boolean; triesLeft: number; lockedUntil: number | null; denied?: true }> {
  const linkId = legacyLinkId(ownerUid, inheritorUid)
  const guessHash = await hashAnswer(linkId, answer)
  const ref = legacyAttemptDoc(linkId)
  const prevSnap = await getDoc(ref)
  const prev = prevSnap.exists() ? prevSnap.data() : null
  const prevStartMs = prev?.windowStart?.toMillis?.() ?? null
  const fresh = !prev || prevStartMs === null || Date.now() > prevStartMs + TRY_WINDOW_MS
  const count = fresh ? 1 : prev!.count + 1
  const windowStartMs = fresh ? null : prevStartMs
  const lockedUntil = windowStartMs === null ? null : windowStartMs + TRY_WINDOW_MS

  if (count > MAX_TRIES) return { correct: false, triesLeft: 0, lockedUntil }
  try {
    await setDoc(ref, {
      count,
      windowStart: fresh ? serverTimestamp() : prev!.windowStart,
      guessHash,
      lastAt: serverTimestamp(),
    } as never)
  } catch (e) {
    // Denied: out of tries, or the legacy is no longer released (the owner came back). The caller tells them apart.
    if (isDenied(e)) return { correct: false, triesLeft: 0, lockedUntil, denied: true }
    throw e
  }

  const correct = await canReadLegacy(ownerUid)
  const triesLeft = MAX_TRIES - count
  return {
    correct,
    triesLeft,
    lockedUntil: !correct && triesLeft <= 0 ? (windowStartMs ?? Date.now()) + TRY_WINDOW_MS : null,
  }
}

// ---------- shared reads ----------

async function readAll<T>(col: CollectionReference<T>): Promise<WithId<T>[]> {
  const snap = await getDocs(col)
  return snap.docs.map(d => ({ ...d.data(), id: d.id }))
}

async function readOptional<T>(ref: DocumentReference<T>): Promise<T | null> {
  const snap = await getDoc(ref)
  return snap.exists() ? snap.data() : null
}

/** Everything the inheritor may read. Memories use one where('type') query per type so the rules can prove each one. */
export async function loadSharedLegacy(ownerUid: string, shared: LegacyKind[]): Promise<SharedLegacy> {
  const has = (k: LegacyKind) => shared.includes(k)
  const memCol = ownerSub<Memory>(ownerUid, 'memories')
  const [profile, voice, memoryGroups, goals, notes, pages, logs, meals] = await Promise.all([
    readOptional(legacyProfileDoc(ownerUid)),
    readOptional(legacyVoiceDoc(ownerUid)),
    Promise.all(memoryTypesFor(shared).map(async t => {
      const snap = await getDocs(query(memCol, where('type', '==', t)))
      return snap.docs.map(d => ({ ...d.data(), id: d.id }))
    })),
    has('goals') ? readAll(ownerSub<Goal>(ownerUid, 'goals')) : [],
    has('notes') ? readAll(ownerSub<Note>(ownerUid, 'notes')) : [],
    has('diary') ? readAll(ownerSub<DiaryPage>(ownerUid, 'diaryPages')) : [],
    has('health') ? readAll(ownerSub<HealthLog>(ownerUid, 'healthLogs')) : [],
    has('health') ? readAll(ownerSub<Meal>(ownerUid, 'meals')) : [],
  ])
  return { profile, voice, memories: memoryGroups.flat(), goals, notes, pages, health: { logs, meals } }
}

// ---------- voice ----------

export async function getVoice(uid: string): Promise<LegacyVoice | null> {
  return readOptional(legacyVoiceDoc(uid))
}

/** Clamped to the rules' limits; builtAt is always the server time. */
export async function saveVoice(uid: string, voice: Omit<LegacyVoice, 'builtAt'>): Promise<void> {
  await setDoc(legacyVoiceDoc(uid), {
    summary: voice.summary.slice(0, 4000),
    samples: voice.samples.slice(0, 25).map(s => s.slice(0, 300)),
    nicknames: voice.nicknames.slice(0, 20).map(n => ({ person: n.person.slice(0, 200), nickname: n.nickname.slice(0, 100) })),
    language: voice.language?.slice(0, 20) ?? null,
    builtAt: serverTimestamp(),
  } as never)
}

/** Note: the rules require builtAt == request.time, so this also refreshes builtAt. */
export async function removeVoiceSample(uid: string, index: number): Promise<void> {
  const voice = await getVoice(uid)
  if (!voice || index < 0 || index >= voice.samples.length) return
  await saveVoice(uid, { ...voice, samples: voice.samples.filter((_, i) => i !== index) })
}

// ---------- memorial chat history (the inheritor's own space) ----------

export async function addLegacyChatMessage(inheritorUid: string, ownerUid: string, role: LegacyChatMessage['role'], text: string): Promise<string> {
  const ref = await addDoc(legacyChatCol(inheritorUid, ownerUid), { role, text: text.slice(0, 4000), createdAt: serverTimestamp() } as never)
  return ref.id
}

export function watchLegacyChat(
  inheritorUid: string,
  ownerUid: string,
  cb: (messages: WithId<LegacyChatMessage>[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(legacyChatCol(inheritorUid, ownerUid), orderBy('createdAt', 'asc')),
    (snap) => cb(snap.docs.map(d => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }))),
    (e) => onError?.(e),
  )
}
