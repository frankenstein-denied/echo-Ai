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
