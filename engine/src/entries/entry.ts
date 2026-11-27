/*
 * Echo Legacy engine — Entry, the base of every diary entry type (ticket 2.03).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Object-oriented: subclasses override describe/summarize/isReadableOn, and callers
 * use any entry through this base type without checking which kind it is.
 */

export type EntryData = {
  id: string
  /** YYYY-MM-DD */
  date: string
  text: string
  tags: readonly string[]
}

/** Plain JSON form of an entry; this is what the hash chain hashes. */
export type EntryRecord = EntryData & { kind: string; title?: string; recipient?: string; releaseDate?: string }

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** True for a real calendar date written YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const date = new Date(Date.UTC(y, mo - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d
}

function cleanTags(tags: readonly string[]): readonly string[] {
  const out: string[] = []
  for (const t of tags) {
    const tag = t.trim().toLowerCase()
    if (tag && !out.includes(tag)) out.push(tag)
  }
  return Object.freeze(out)
}

export abstract class Entry {
  readonly #data: Readonly<EntryData>

  constructor(data: EntryData) {
    if (!data.id.trim()) throw new Error('An entry needs an id.')
    if (!isIsoDate(data.date)) throw new Error(`Not a valid date: ${data.date}`)
    this.#data = Object.freeze({ id: data.id, date: data.date, text: data.text, tags: cleanTags(data.tags) })
  }

  get id(): string {
    return this.#data.id
  }
  get date(): string {
    return this.#data.date
  }
  get text(): string {
    return this.#data.text
  }
  get tags(): readonly string[] {
    return this.#data.tags
  }

  abstract get kind(): string

  /** One line that says what this entry is. */
  abstract describe(): string

  /** The first `maxWords` words, with "…" when cut. */
  summarize(maxWords = 20): string {
    const words = this.text.trim().split(/\s+/).filter(Boolean)
    if (words.length <= maxWords) return words.join(' ')
    return `${words.slice(0, maxWords).join(' ')}…`
  }

  /** Whether `asker` may read the full text on `today` (YYYY-MM-DD), apart from the policy. */
  isReadableOn(_today: string, _asker: string): boolean {
    return true
  }

  toRecord(): EntryRecord {
    return { kind: this.kind, id: this.id, date: this.date, text: this.text, tags: [...this.tags] }
  }
}
