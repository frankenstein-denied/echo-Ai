// Undo for deletes Echo makes (typed chat and calls). Pure store + data shaping; the Firestore write lives in
// client.ts (restoreDeleted). A restore recreates the doc with the SAME id and fields; createdAt/updatedAt are
// re-stamped with serverTimestamp() because the security rules require createdAt == request.time on create
// (no backdating), so a restored item's createdAt becomes the restore time.

export const UNDO_MS = 10000

export type UndoKind = 'reminder' | 'note' | 'goal' | 'meal'
export type UndoEntry = { key: number; kind: UndoKind; docId: string; title: string; data: Record<string, unknown>; expiresAt: number }
export type UndoInput = Omit<UndoEntry, 'key' | 'expiresAt'>

/** Fields each collection's create rule allows besides the timestamps. */
export const RESTORE_FIELDS: Record<UndoKind, readonly string[]> = {
  note: ['title', 'body', 'category', 'tags'],
  goal: ['title', 'category', 'progress', 'streak', 'milestones', 'targetDate'],
  reminder: ['title', 'dueAt', 'done', 'source'],
  meal: ['date', 'mealType', 'description', 'items', 'totalCalories', 'source', 'estimated'],
}

/** The deleted doc's fields that may be written back (timestamps and unknown keys dropped, undefined skipped). */
export function restoreData(kind: UndoKind, data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of RESTORE_FIELDS[kind]) if (data[k] !== undefined) out[k] = data[k]
  return out
}

export function undoLabel(e: Pick<UndoEntry, 'kind' | 'title'>): string {
  return `Deleted ${e.kind} "${e.title}"`
}

export type UndoStore = {
  push(e: UndoInput): UndoEntry
  /** Remove and return a live entry (null when unknown or expired). */
  take(key: number): UndoEntry | null
  /** Drop expired entries; returns what was dropped. */
  expire(): UndoEntry[]
  list(): UndoEntry[]
  subscribe(fn: (entries: UndoEntry[]) => void): () => void
}

export function createUndoStore(opts: { ttlMs?: number; now?: () => number; max?: number } = {}): UndoStore {
  const ttl = opts.ttlMs ?? UNDO_MS
  const now = opts.now ?? Date.now
  const max = opts.max ?? 5
  let entries: UndoEntry[] = []
  let seq = 0
  const subs = new Set<(e: UndoEntry[]) => void>()
  const emit = () => {
    const snap = [...entries]
    for (const fn of subs) fn(snap)
  }
  return {
    push(e) {
      const entry: UndoEntry = { ...e, key: ++seq, expiresAt: now() + ttl }
      entries = [...entries, entry].slice(-max)
      emit()
      return entry
    },
    take(key) {
      const hit = entries.find((x) => x.key === key)
      if (!hit) return null
      entries = entries.filter((x) => x.key !== key)
      emit()
      return hit.expiresAt > now() ? hit : null
    },
    expire() {
      const t = now()
      const gone = entries.filter((x) => x.expiresAt <= t)
      if (gone.length) {
        entries = entries.filter((x) => x.expiresAt > t)
        emit()
      }
      return gone
    },
    list() {
      return [...entries]
    },
    subscribe(fn) {
      subs.add(fn)
      return () => {
        subs.delete(fn)
      }
    },
  }
}
