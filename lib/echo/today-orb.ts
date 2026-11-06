import { ORB_KINDS, type Orb, type OrbKind } from './orbs'

export const TODAY_ORB_RADIUS = 60

/** A synthetic empty (pearl) orb for a page that has nothing saved yet, or no Firestore doc yet. */
export function emptyPageOrb(pageId: string): Orb {
  const counts = Object.fromEntries(ORB_KINDS.map((k) => [k, 0])) as Record<OrbKind, number>
  return { id: `orb-${pageId}`, pageId, label: 'Today', ms: 0, messageCount: 0, counts, members: [], involvement: 0, radius: TODAY_ORB_RADIUS }
}

/** True once the page holds at least one message from the user. */
export function hasUserMessage(messages: { role: string }[] | null | undefined): boolean {
  return !!messages?.some((m) => m.role === 'user')
}

/** Whether the welcome orb shows: messages have loaded and the page has no user message or check-in, so a check-in is never pushed down by it. */
export function showTodayWelcome(messages: { role: string; checkIn?: boolean }[] | null | undefined): boolean {
  return !!messages && !hasUserMessage(messages) && !messages.some((m) => m.checkIn)
}

/** Drops check-ins the user did not answer (the next message is not theirs), keeping the newest so a short reply to it still makes sense. */
export function dropUnansweredCheckIns<T extends { role: string; checkIn?: boolean }>(messages: T[]): T[] {
  const newest = messages.map((m) => !!m.checkIn).lastIndexOf(true)
  return messages.filter((m, i) => !m.checkIn || i === newest || messages[i + 1]?.role === 'user')
}
