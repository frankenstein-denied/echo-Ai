// Pure helpers for the Notes card grid (no Firebase imports so they are unit-testable).

export const DEFAULT_NOTE_CATEGORIES = ['Diary', 'Career', 'Personal', 'Health', 'Ideas']

export function previewText(body: string, max = 200): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}...` : flat
}

// Categories present in the notes, in first-seen order, deduped case-insensitively.
export function noteCategories(notes: { category: string }[]): string[] {
  const out: string[] = []
  for (const n of notes) {
    const c = n.category.trim()
    if (c && !out.some((x) => x.toLowerCase() === c.toLowerCase())) out.push(c)
  }
  return out
}

// Options for the category editor: defaults plus any custom categories, always including `current`.
export function categoryOptions(present: string[], current?: string): string[] {
  const out = [...DEFAULT_NOTE_CATEGORIES]
  for (const c of [...present, ...(current ? [current] : [])]) {
    const t = c.trim()
    if (t && !out.some((x) => x.toLowerCase() === t.toLowerCase())) out.push(t)
  }
  return out
}

export function filterByCategory<T extends { category: string }>(notes: T[], category: string): T[] {
  if (!category || category === 'All') return notes
  const c = category.toLowerCase()
  return notes.filter((n) => n.category.trim().toLowerCase() === c)
}

export function relativeDate(ms: number, now: number): string {
  const diff = Math.max(0, now - ms)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day === 1) return 'Yesterday'
  if (day < 7) return `${day}d ago`
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: day >= 365 ? 'numeric' : undefined })
}

// Newest-edited first; falls back to createdAt when updatedAt is missing.
export function sortByUpdated<T extends { updatedAt?: { toMillis(): number } | null; createdAt?: { toMillis(): number } | null }>(notes: T[]): T[] {
  const ms = (n: T) => n.updatedAt?.toMillis() ?? n.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
  return [...notes].sort((a, b) => ms(b) - ms(a))
}
