/*
 * Echo Legacy engine — Grant: one permission (or denial) in a protocol (ticket 2.02).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */
import { LetterOfWishes, type Entry } from '../entries'

/** existence < summary < full. */
export type AccessLevel = 'existence' | 'summary' | 'full'

export type Selector =
  | { kind: 'mentions'; name: string }
  | { kind: 'tag'; tag: string }
  | { kind: 'letter'; title: string }

export type Effect = 'allow' | 'deny'

const RANK: Readonly<Record<AccessLevel, number>> = { existence: 0, summary: 1, full: 2 }

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whole-name match: "maria" matches "Maria" and "Maria's", never "Mariano". `_` stands for a space. */
export function mentionsName(text: string, name: string): boolean {
  const wanted = name.replace(/_/g, ' ').trim().normalize('NFC')
  if (!wanted) return false
  return new RegExp(`(?<![\\p{L}\\p{M}])${escapeRegExp(wanted)}(?![\\p{L}\\p{M}])`, 'iu').test(text.normalize('NFC'))
}

export class Grant {
  readonly #level: AccessLevel
  readonly #selector: Readonly<Selector>
  readonly #effect: Effect

  constructor(level: AccessLevel, selector: Selector, effect: Effect = 'allow') {
    this.#level = level
    this.#selector = Object.freeze({ ...selector })
    this.#effect = effect
    Object.freeze(this)
  }

  get level(): AccessLevel {
    return this.#level
  }
  get selector(): Readonly<Selector> {
    return this.#selector
  }
  get effect(): Effect {
    return this.#effect
  }

  /** Whether this grant is about `entry`. */
  matches(entry: Entry): boolean {
    const s = this.#selector
    switch (s.kind) {
      case 'mentions':
        return mentionsName(entry.text, s.name)
      case 'tag':
        return entry.tags.includes(s.tag.trim().toLowerCase())
      case 'letter':
        return entry instanceof LetterOfWishes && entry.title === s.title
    }
  }

  /**
   * Whether this grant applies to a request at `level`.
   * An allow reaches its own level and the weaker ones (a summary grant also gives existence).
   * A deny reaches its own level and every stronger one (hiding existence hides everything).
   */
  covers(level: AccessLevel): boolean {
    return this.#effect === 'allow' ? RANK[this.#level] >= RANK[level] : RANK[level] >= RANK[this.#level]
  }
}
