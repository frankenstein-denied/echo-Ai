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
        return entry.text.toLowerCase().includes(s.name.replace(/_/g, ' ').toLowerCase())
      case 'tag':
        return entry.tags.includes(s.tag.trim().toLowerCase())
      case 'letter':
        return entry instanceof LetterOfWishes && entry.title === s.title
    }
  }

  /** Whether this grant's level reaches `level` (a summary grant also covers existence). */
  covers(level: AccessLevel): boolean {
    return RANK[this.#level] >= RANK[level]
  }
}
