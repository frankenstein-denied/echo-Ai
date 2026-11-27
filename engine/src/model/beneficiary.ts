/*
 * Echo Legacy engine — Beneficiary: a registered person who may ask about the owner (ticket 2.02).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */
import { PolicyFrozen } from '../errors'
import type { Protocol } from './protocol'

export class Beneficiary {
  readonly #id: string
  readonly #displayName: string
  #protocol: Protocol | null = null
  #sealed = false

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
    if (this.#sealed) throw new PolicyFrozen('The legacy policy is frozen and cannot change.')
    if (protocol.holder !== this.#id) throw new Error(`This protocol is for ${protocol.holder}, not ${this.#id}.`)
    this.#protocol = protocol
  }

  /** Called when the owner's policy freezes: the protocol and its grants can no longer change. */
  seal(): void {
    this.#sealed = true
    this.#protocol?.seal()
  }
}
