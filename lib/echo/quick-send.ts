// Telling Echo from anywhere (the orb sheet, the "tell Echo" boxes): the same pipeline as the diary chat, without the
// diary open. The sentence and Echo's reply land on today's diary page; what Echo saved comes back as saved cards.
import type { User } from 'firebase/auth'
import { getDoc, getDocs, limit, limitToLast, orderBy, query, Timestamp, where } from 'firebase/firestore'
import {
  addPageMessage,
  connectorsCol,
  createDiaryPage,
  deleteGoal,
  deleteMeal,
  deleteNote,
  deleteReminder,
  diaryPagesCol,
  memoriesCol,
  pageMessagesCol,
  userDoc,
  type UserProfile,
} from '@/lib/firestore'
import { applyEchoResponseWithMusic, connectorContext, readRefSource, saveWebSearchLogin, sendToEcho, webSearchKeyOf, type SavedItem } from './client'
import { buildContext, buildItemsContext } from './context'
import { pickTodayPage, sortPages } from './diary'
import { languageCode } from './languages'
import { noteLegacyActivity } from './legacy-activity'
import { resolveMusicControl } from './music-play'
import { localDateKey } from './view-helpers'

export type QuickSendResult = { reply: string; saved: SavedItem[]; failed: string[]; pageId: string }

/** play_music / music_control outside the player: nothing plays, the reply says where it can. */
export const NO_PLAYER_REPLY = "I can't play music from here. Ask me in the diary chat or on the Music page."

const HISTORY_MAX = 20

function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

/** Today's page by the diary's rule (the most recently updated page created today), or null. */
async function findTodayPageId(uid: string): Promise<string | null> {
  const snap = await getDocs(query(diaryPagesCol(uid), where('createdAt', '>=', Timestamp.fromDate(startOfToday())), limit(50)))
  const pages = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }))
  return pickTodayPage(sortPages(pages))?.id ?? null
}

// One page creation per user at a time, so two quick sends in a row don't make two "today" pages.
const creating = new Map<string, Promise<string>>()

async function ensureTodayPage(uid: string): Promise<string> {
  const inFlight = creating.get(uid)
  if (inFlight) return inFlight
  // A failed lookup throws: it must never read as "no page today" and create a second one.
  const p = (async () => (await findTodayPageId(uid)) ?? createDiaryPage(uid))()
  creating.set(uid, p)
  try {
    return await p
  } finally {
    creating.delete(uid)
  }
}

const soft = <T>(what: string, p: Promise<T>, empty: T): Promise<T> =>
  p.catch(() => {
    console.warn(`Echo: could not read ${what}`)
    return empty
  })

async function readMemories(uid: string) {
  const [top, traits] = await Promise.all([
    getDocs(query(memoriesCol(uid), orderBy('mentions', 'desc'), limit(40))),
    getDocs(query(memoriesCol(uid), where('type', '==', 'trait'), limit(20))),
  ])
  const byId = new Map<string, ReturnType<(typeof top.docs)[number]['data']>>()
  for (const d of [...top.docs, ...traits.docs]) byId.set(d.id, d.data({ serverTimestamps: 'estimate' }))
  return [...byId.values()]
}

async function readHistory(uid: string, pageId: string | null) {
  if (!pageId) return []
  const snap = await getDocs(query(pageMessagesCol(uid, pageId), orderBy('createdAt'), limitToLast(HISTORY_MAX)))
  return snap.docs.map((d) => d.data({ serverTimestamps: 'estimate' }))
}

/**
 * Sends one sentence to Echo and saves the result on today's diary page (created when missing).
 * Context comes from one-off reads (no listeners). Nothing is written until Echo has answered: when the request
 * fails (offline, quota, server error) this throws and the diary is untouched, so the caller keeps the text.
 * Music actions are not played (there is no player here); the reply says so.
 */
export async function quickSend(args: { user: User; profile: UserProfile; text: string }): Promise<QuickSendResult> {
  const { user, profile } = args
  const text = args.text.trim()
  if (!text) throw new Error('Type or say something first.')
  const uid = user.uid
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

  // Not soft: if the page list can't be read, today's page may exist, so stop before asking Echo.
  const knownPage = await findTodayPageId(uid).catch(() => {
    throw new Error("Couldn't reach your diary. Check your connection and try again.")
  })
  const [history, memories, src, connectorDocs, language] = await Promise.all([
    soft('page messages', readHistory(uid, knownPage), []),
    soft('memories', readMemories(uid), []),
    readRefSource(uid, localDateKey(new Date())),
    soft('connectors', getDocs(connectorsCol(uid)).then((s) => s.docs.map((d) => ({ ...d.data(), id: d.id }))), []),
    // Follow a language changed in Settings since sign-in (the shell's profile is read once).
    soft('language', getDoc(userDoc(uid)).then((s) => languageCode(s.data()?.language ?? profile.language)), languageCode(profile.language)),
  ])
  const built = buildItemsContext(src, Date.now(), timeZone)
  const connectors = connectorContext(connectorDocs)
  const context = buildContext({ ...profile, language }, history, memories, built.items, connectors.statuses)

  const res = await sendToEcho(user, text, context, webSearchKeyOf(connectors), connectors.aiKeys)
  saveWebSearchLogin(uid, res)
  if (res.error) throw new Error('Echo is having trouble right now.')

  // Echo answered: now write, in the diary's order (page, the user's message, the saves, Echo's reply).
  const pageId = knownPage ?? (await ensureTodayPage(uid))
  await addPageMessage(uid, pageId, 'user', text)
  void noteLegacyActivity(uid)
  const { res: noControl } = resolveMusicControl(res, () => 'unavailable')
  const controlled = noControl === res ? res : { ...noControl, reply: NO_PLAYER_REPLY }
  const applied = await applyEchoResponseWithMusic(
    uid,
    pageId,
    controlled,
    async () => ({ ok: false, error: 'unavailable', reply: NO_PLAYER_REPLY }),
    () => undefined,
    { refs: built.refs, source: 'chat' },
  )
  return { reply: applied.reply, saved: applied.saved, failed: applied.failed, pageId }
}

/** Short text for a failed quick send, shown in the box (the typed text stays). */
export function quickSendError(e: unknown, online = typeof navigator === 'undefined' ? true : navigator.onLine): string {
  if (!online) return "You're offline. Your words are still here; send again when you're back."
  if (e instanceof Error && e.message) {
    if (e.name === 'TimeoutError') return 'Echo took too long. Try again.'
    if (/^(Echo|Please|Type)/.test(e.message)) return e.message
  }
  return "Couldn't reach Echo. Try again."
}

const DELETE_CREATED: Partial<Record<SavedItem['type'], (uid: string, id: string) => Promise<void>>> = {
  note: deleteNote,
  goal: deleteGoal,
  reminder: deleteReminder,
  // Only meals carry a docId among health items (health logs are per-day upserts and never get one).
  health: deleteMeal,
}

/**
 * Undo a saved card: deletes the doc Echo created, by its exact id. Updates, deletes and items without a created
 * doc id are never undone this way (returns false), so an item edited elsewhere is never touched by another doc.
 */
export async function undoSaved(uid: string, item: SavedItem): Promise<boolean> {
  if (item.op !== undefined || !item.docId) return false
  const del = DELETE_CREATED[item.type]
  if (!del) return false
  await del(uid, item.docId)
  return true
}
