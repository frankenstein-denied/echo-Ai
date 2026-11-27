/*
 * Echo Legacy engine — Protocol: everything one beneficiary may (or may not) see (ticket 2.02).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * This is the object-oriented mirror of the Prolog rules: deny by default, deny beats allow.
 * A deny hides its level and every stronger one; an allow gives its level and every weaker one.
 */
import type { Entry } from '../entries'
import { PolicyFrozen } from '../errors'
import type { AccessLevel, Effect, Grant } from './grant'

export class Protocol {
  readonly #holder: string
  readonly #grants: Grant[] = []
  #sealed = false

  constructor(holder: string) {
    this.#holder = holder
  }

  get holder(): string {
    return this.#holder
  }

  get grants(): readonly Grant[] {
    return Object.freeze([...this.#grants])
  }

  get isSealed(): boolean {
    return this.#sealed
  }

  addGrant(grant: Grant): void {
    if (this.#sealed) throw new PolicyFrozen('The legacy policy is frozen and cannot change.')
    this.#grants.push(grant)
  }

  /** Called when the owner's policy freezes: no more grants can be added. */
  seal(): void {
    this.#sealed = true
  }

  decide(entry: Entry, level: AccessLevel): Effect {
    const applies = (g: Grant) => g.matches(entry) && g.covers(level)
    if (this.#grants.some((g) => g.effect === 'deny' && applies(g))) return 'deny'
    if (this.#grants.some((g) => g.effect === 'allow' && applies(g))) return 'allow'
    return 'deny'
  }
}
