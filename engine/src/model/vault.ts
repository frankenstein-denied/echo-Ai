/*
 * Echo Legacy engine — Vault: the owner's entries, append-only and hash-chained (ticket 2.02).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Encapsulation: the chain is a true private field (#chain). Outside code can only append,
 * count, verify, and ask for entries as a beneficiary the owner registered. Every entry
 * handed out is a fresh frozen copy, so callers can never reach the stored data.
 *
 * Only the owner can register beneficiaries: the first Owner built on a vault claims it and
 * receives a private key; admit() needs that key. A Beneficiary made up by outside code,
 * with its own protocol, is never registered and so sees nothing.
 */
import { appendLink, verifyChain, type ChainLink } from '../chain/hash-chain'
import { entryFromRecord, type Entry } from '../entries'
import { AccessDenied } from '../errors'
import type { Beneficiary } from './beneficiary'
import type { AccessLevel } from './grant'

const NOTHING_TO_SHARE = 'Nothing to share.'

export class Vault {
  #chain: readonly ChainLink[] = []
  #key: symbol | null = null
  readonly #registered = new WeakSet<Beneficiary>()

  /** Called once by the Owner that holds this vault; returns the key admit() needs. */
  claim(): symbol {
    if (this.#key) throw new Error('This vault already belongs to an owner.')
    this.#key = Symbol('vault-key')
    return this.#key
  }

  /** Registers a beneficiary. Only the owner holding the key can do this. */
  admit(beneficiary: Beneficiary, key: symbol): void {
    if (!this.#key || key !== this.#key) throw new AccessDenied(NOTHING_TO_SHARE)
    this.#registered.add(beneficiary)
  }

  /** Adds an entry at the end. Types the vault cannot read back are refused (UnknownEntryType). */
  append(entry: Entry): void {
    entryFromRecord(entry.toRecord())
    this.#chain = appendLink(this.#chain, entry)
  }

  count(): number {
    return this.#chain.length
  }

  verify(): true {
    return verifyChain(this.#chain)
  }

  /** The entries `beneficiary` may see at `level` on `today`. Deny by default. */
  entriesFor(beneficiary: Beneficiary, level: AccessLevel, today: string): readonly Entry[] {
    const protocol = beneficiary.protocol
    if (!protocol || !this.#registered.has(beneficiary)) return Object.freeze([])
    const out: Entry[] = []
    for (const link of this.#chain) {
      const entry = entryFromRecord(link.record)
      if (protocol.decide(entry, level) !== 'allow') continue
      if (level === 'full' && !entry.isReadableOn(today, beneficiary.id)) continue
      out.push(entry)
    }
    return Object.freeze(out)
  }

  /** The full entry, or AccessDenied — with the same message whether it is missing or not allowed. */
  read(beneficiary: Beneficiary, entryId: string, today: string): Entry {
    const found = this.entriesFor(beneficiary, 'full', today).find((e) => e.id === entryId)
    if (!found) throw new AccessDenied(NOTHING_TO_SHARE)
    return found
  }
}
