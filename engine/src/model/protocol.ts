/*
 * Echo Legacy engine — Protocol: everything one beneficiary may (or may not) see (ticket 2.02).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * This is the object-oriented mirror of the Prolog rules: deny by default, deny beats allow.
 */
import type { Entry } from '../entries'
import type { AccessLevel, Effect, Grant } from './grant'

export class Protocol {
  readonly #holder: string
  readonly #grants: Grant[] = []

  constructor(holder: string) {
    this.#holder = holder
  }

  get holder(): string {
    return this.#holder
  }

  get grants(): readonly Grant[] {
    return Object.freeze([...this.#grants])
  }

  addGrant(grant: Grant): void {
    this.#grants.push(grant)
  }

  decide(entry: Entry, level: AccessLevel): Effect {
    const applies = (g: Grant) => g.matches(entry) && g.covers(level)
    if (this.#grants.some((g) => g.effect === 'deny' && applies(g))) return 'deny'
    if (this.#grants.some((g) => g.effect === 'allow' && applies(g))) return 'allow'
    return 'deny'
  }
}
