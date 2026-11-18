// Daily voice brief: pure helpers for storing one brief per local day (users/{uid}/briefs/{day}).
import { localDateKey } from './view-helpers'

export const BRIEF_TEXT_MAX = 1000
export const RECENT_BRIEFS = 3

export type BriefDoc = { text: string; partial: boolean; createdAt?: { toMillis?: () => number } | null }

/** The brief doc id: the local calendar day, YYYY-MM-DD. */
export function briefDayKey(now: Date): string {
  return localDateKey(now)
}

export function clipBrief(text: string): string {
  return text.trim().slice(0, BRIEF_TEXT_MAX)
}

/** What to store after a brief call: a full brief, a partial one (the user talked), or nothing. */
export function briefOutcome(e: { echoText: string; completed: boolean; userSpoke: boolean }): 'save' | 'partial' | 'skip' {
  if (!e.echoText.trim()) return 'skip'
  if (e.userSpoke) return 'partial'
  return e.completed ? 'save' : 'skip'
}

/**
 * The brief from a brief call's first finalized turn, or null when nothing should be stored.
 * `revealedOnly`: the turn closed early (hang-up, barge-in, user speech); `userCut`: the user spoke after the
 * model finished but while the brief was still playing out. A hang-up once the brief fully played still counts.
 */
export function briefTurnResult(f: {
  echoText: string
  revealedOnly: boolean
  interrupted: boolean
  userText: string
  userCut: boolean
  modelComplete: boolean
  playing: boolean
}): { text: string; partial: boolean } | null {
  const completed = (!f.revealedOnly || (f.modelComplete && !f.playing)) && !f.interrupted
  const userSpoke = !!f.userText.trim() || f.interrupted || f.userCut
  const outcome = briefOutcome({ echoText: f.echoText, completed, userSpoke })
  return outcome === 'skip' ? null : { text: f.echoText, partial: outcome === 'partial' }
}

/** The last few full briefs' texts, newest first, so a new brief can avoid repeating them. */
export function recentBriefTexts(docs: BriefDoc[]): string[] {
  const millis = (d: BriefDoc) => d.createdAt?.toMillis?.() ?? 0
  return docs
    .filter((d) => !d.partial && typeof d.text === 'string' && d.text.trim())
    .sort((a, b) => millis(b) - millis(a))
    .slice(0, RECENT_BRIEFS)
    .map((d) => clipBrief(d.text))
}
