import { getDocs } from 'firebase/firestore'
import { goalsCol, updateGoal } from '@/lib/firestore'
import { progressFixes } from './goal-progress'

// Users already normalized in this app session (module scope: survives view changes, resets on reload).
const done = new Set<string>()

/**
 * One-time, per app session: stores the derived progress on goals whose stored value is stale (older manual
 * percentages), so readers of the stored field (the Android notification, check-ins) agree with the app.
 * Only `progress` (+ updatedAt) is written, and only where it differs. Failures are logged and ignored.
 */
export async function normalizeGoalProgress(uid: string): Promise<number> {
  if (done.has(uid)) return 0
  done.add(uid)
  try {
    const snap = await getDocs(goalsCol(uid))
    const fixes = progressFixes(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    const results = await Promise.allSettled(fixes.map((f) => updateGoal(uid, f.id, { progress: f.progress })))
    for (const r of results) if (r.status === 'rejected') console.warn('Echo: could not normalize a goal', r.reason)
    return results.filter((r) => r.status === 'fulfilled').length
  } catch (e) {
    done.delete(uid)
    console.warn('Echo: goal progress normalization skipped', e)
    return 0
  }
}
