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
