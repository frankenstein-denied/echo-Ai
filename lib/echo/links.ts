export const MAX_MEMORY_LINKS = 50

/**
 * Reciprocal link planning: for every A -> B in `entries`, B should also list A.
 * Returns, per target id, the ids to add (never itself, no duplicates).
 */
export function planReciprocalLinks(entries: { id: string; linkIds: string[] }[]): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const e of entries) {
    for (const target of e.linkIds) {
      if (target === e.id) continue
      const list = out.get(target) ?? []
      if (!list.includes(e.id)) list.push(e.id)
      out.set(target, list)
    }
  }
  return out
}

/** Merge new ids after existing ones (deduped), keeping the newest `cap`. */
export function mergeLinks(existing: string[], add: string[], cap = MAX_MEMORY_LINKS): string[] {
  return [...new Set([...existing, ...add])].slice(-cap)
}

/** Diary page ids a memory was mentioned in: the page moves to the end, keeping the newest `cap`. */
export function mergePages(existing: string[] | undefined, pageId: string, cap = MAX_MEMORY_LINKS): string[] {
  return [...new Set([...(existing ?? []).filter((p) => p !== pageId), pageId])].slice(-cap)
}

/**
 * Fields for a reciprocal-only update of an existing memory doc (null when nothing to add).
 * Legacy docs written before `mentions` existed fail the rules' hasAll check, so they get mentions: 1;
 * docs that already have a numeric mentions keep it untouched.
 */
export function buildReciprocalUpdate(data: { links?: unknown; mentions?: unknown }, add: string[]): { links: string[]; mentions?: 1 } | null {
  const current = Array.isArray(data.links) ? (data.links as string[]) : []
  const fresh = add.filter((id) => !current.includes(id))
  if (!fresh.length) return null
  const out: { links: string[]; mentions?: 1 } = { links: mergeLinks(current, fresh) }
  if (typeof data.mentions !== 'number' || data.mentions < 1) out.mentions = 1
  return out
}

/** Memories that came only from `pageId` (deleted with it) vs also from other pages (kept). Memories without `pages` are neither. */
export function splitImpact(memories: { id: string; pages?: string[] }[], pageId: string): { exclusive: string[]; shared: string[] } {
  const exclusive: string[] = []
  const shared: string[] = []
  for (const m of memories) {
    if (!m.pages?.includes(pageId)) continue
    if (m.pages.every((p) => p === pageId)) exclusive.push(m.id)
    else shared.push(m.id)
  }
  return { exclusive, shared }
}

/** Body copy of the delete-page dialog. `n` is the number of 2nd Brain nodes only this page made (null = unknown). */
export function pageDeleteBody(n: number | null): string {
  const tail = 'Notes, reminders, goals, health logs and meals stay.'
  if (n === 0) return `This conversation and its messages will be deleted. Nothing will be removed from your 2nd Brain. ${tail}`
  const lead = n === null ? 'along with any 2nd Brain nodes that came only from it.' : `along with ${n} 2nd Brain node${n === 1 ? '' : 's'} that came only from it.`
  return `This conversation and its messages will be deleted, ${lead} Nodes also mentioned in other conversations stay. ${tail}`
}
