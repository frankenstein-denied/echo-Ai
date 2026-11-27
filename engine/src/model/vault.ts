/*
 * Echo Legacy engine — Vault: the owner's entries, append-only and hash-chained (ticket 2.02).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Encapsulation: the chain is a true private field (#chain). Outside code can only append,
 * count, verify, and ask for entries through a beneficiary's protocol. Every entry handed
 * out is a fresh frozen copy, so callers can never reach the stored data.
 */
import { appendLink, verifyChain, type ChainLink } from '../chain/hash-chain'
import { entryFromRecord, type Entry } from '../entries'
import { AccessDenied } from '../errors'
import type { Beneficiary } from './beneficiary'
import type { AccessLevel } from './grant'

const NOTHING_TO_SHARE = 'Nothing to share.'

export class Vault {
  #chain: readonly ChainLink[] = []

  append(entry: Entry): void {
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
    if (!protocol) return Object.freeze([])
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
