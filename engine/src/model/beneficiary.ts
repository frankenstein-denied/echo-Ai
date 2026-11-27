/*
 * Echo Legacy engine — Beneficiary: a registered person who may ask about the owner (ticket 2.02).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */
import type { Protocol } from './protocol'

export class Beneficiary {
  readonly #id: string
  readonly #displayName: string
  #protocol: Protocol | null = null

  constructor(id: string, displayName: string) {
    this.#id = id
    this.#displayName = displayName
  }

  get id(): string {
    return this.#id
  }
  get displayName(): string {
    return this.#displayName
  }
  get protocol(): Protocol | null {
    return this.#protocol
  }

  assignProtocol(protocol: Protocol): void {
    if (protocol.holder !== this.#id) throw new Error(`This protocol is for ${protocol.holder}, not ${this.#id}.`)
    this.#protocol = protocol
  }
}
