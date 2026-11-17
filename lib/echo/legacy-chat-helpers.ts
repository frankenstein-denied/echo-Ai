import type { MemorialTurn } from './legacy-prompt'

// Pure helpers for the inheritor side of Legacy: the memorial chat, the sidebar badge and names.

const DELAY_BASE_MS = 600
const DELAY_PER_CHAR_MS = 25
const DELAY_MAX_MS = 2500
const HISTORY_MAX = 20

/** How long "<name> is typing…" shows before a bubble appears: 600 ms + 25 ms per character, at most 2.5 s. */
export function bubbleDelayMs(text: string): number {
  return Math.min(DELAY_MAX_MS, DELAY_BASE_MS + DELAY_PER_CHAR_MS * Array.from(text).length)
}

/** The last 20 non-empty turns, oldest first, as the chat route takes them. */
export function historyForRequest(messages: readonly { role: MemorialTurn['role']; text: string }[]): MemorialTurn[] {
  return messages
    .filter((m) => typeof m.text === 'string' && m.text.trim())
    .slice(-HISTORY_MAX)
    .map((m) => ({ role: m.role, text: m.text }))
}

/** Shown when an open legacy stops being readable because the owner came back. */
export const RELOCKED_MESSAGE = 'This legacy is locked again.'

/** Before a memorial chat send: go ahead unless the access check says the legacy is no longer readable. */
export function chatSendGate(readable: boolean | 'unknown'): 'send' | 'locked' {
  return readable === false ? 'locked' : 'send'
}

/** Pending requests plus released legacies this device hasn't shown yet. */
export function legacyBadgeCount(pending: number, released: readonly string[], seen: readonly string[]): number {
  const seenSet = new Set(seen)
  return pending + new Set(released.filter((uid) => !seenSet.has(uid))).size
}

/** The first character of a name, uppercased, for an avatar; "?" when there is none. */
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0]
  return first ? first.toUpperCase() : '?'
}

/** localStorage key marking a released legacy as already announced on this device. */
export function legacySeenKey(ownerUid: string): string {
  return `echo.legacy.seen.${ownerUid}`
}

/** What to call the owner: their preferred name, display name, the name on the link, else "Someone". */
export function ownerDisplayName(profile: { preferredName?: string | null; displayName?: string | null } | null, linkName: string | null | undefined): string {
  return profile?.preferredName?.trim() || profile?.displayName?.trim() || linkName?.trim() || 'Someone'
}
