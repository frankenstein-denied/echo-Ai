import { getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { goalsCol, healthLogsCol, memoriesCol, notesCol, remindersCol } from '@/lib/firestore'
import { buildSnapshot, localDate, parseRange, searchNotes, shapeGoals, shapeHealth, shapeMemories, shapeReminders, type GoalIn, type HealthIn, type ReminderIn } from './live-read'
import type { ReadFn } from './live-tools'

// Firestore reads for Echo call read tools. They run in the browser as the signed-in user, so the
// owner-only security rules apply exactly as in the rest of the app.

const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : typeof (t as Timestamp)?.toMillis === 'function' ? (t as Timestamp).toMillis() : 0)

async function goals(uid: string): Promise<GoalIn[]> {
  const snap = await getDocs(query(goalsCol(uid), limit(50)))
  return snap.docs.map((d) => {
    const g = d.data()
    return { title: g.title, category: g.category, progress: g.progress, targetDate: g.targetDate, milestones: g.milestones, updatedAtMs: ms(g.updatedAt) }
  })
}

async function reminders(uid: string, range: 'today' | 'upcoming' | 'all', nowMs: number): Promise<ReminderIn[]> {
  const col = remindersCol(uid)
  const q =
    range === 'all'
      ? query(col, orderBy('dueAt', 'desc'), limit(20))
      : range === 'today'
        ? query(col, where('dueAt', '>=', Timestamp.fromMillis(nowMs - 86400000)), where('dueAt', '<=', Timestamp.fromMillis(nowMs + 86400000)), orderBy('dueAt'), limit(60))
        : query(col, where('dueAt', '>=', Timestamp.fromMillis(nowMs)), orderBy('dueAt'), limit(60))
  const snap = await getDocs(q)
  return snap.docs.map((d) => {
    const r = d.data()
    return { title: r.title, dueAtMs: ms(r.dueAt), done: r.done }
  })
}

async function health(uid: string, n: number): Promise<HealthIn[]> {
  const snap = await getDocs(query(healthLogsCol(uid), orderBy('date', 'desc'), limit(n)))
  return snap.docs.map((d) => d.data() as HealthIn)
}

export function makeReader(uid: string, timeZone: string): ReadFn {
  return async (name, args) => {
    const now = Date.now()
    switch (name) {
      case 'get_goals':
        return shapeGoals(await goals(uid))
      case 'get_reminders': {
        const range = parseRange(args.range)
        return shapeReminders(await reminders(uid, range, now), range, now, timeZone)
      }
      case 'search_notes': {
        const snap = await getDocs(query(notesCol(uid), orderBy('updatedAt', 'desc'), limit(200)))
        const notes = snap.docs.map((d) => {
          const n = d.data()
          return { title: n.title, body: n.body, category: n.category, tags: n.tags, updatedAtMs: ms(n.updatedAt) }
        })
        return searchNotes(notes, args.query, args.limit, timeZone)
      }
      case 'get_health':
        return shapeHealth(await health(uid, 14), args.days, localDate(now, timeZone))
      case 'get_memories': {
        const snap = await getDocs(query(memoriesCol(uid), orderBy('mentions', 'desc'), limit(200)))
        return shapeMemories(snap.docs.map((d) => ({ ...d.data(), id: d.id })), args.query)
      }
    }
  }
}

/** Snapshot for the session instruction; best effort (empty string on failure or timeout). */
export async function loadSnapshot(uid: string, timeZone: string, timeoutMs = 2500): Promise<string> {
  const now = Date.now()
  const work = Promise.all([goals(uid), reminders(uid, 'upcoming', now - 86400000), health(uid, 1)]).then(([g, r, h]) => buildSnapshot(g, r, h, now, timeZone))
  const timeout = new Promise<string>((res) => setTimeout(() => res(''), timeoutMs))
  return Promise.race([work.catch(() => ''), timeout])
}
