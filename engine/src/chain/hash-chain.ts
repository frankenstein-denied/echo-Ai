/*
 * Echo Legacy engine — append-only, hash-chained entry log (ticket 2.05).
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 *
 * Functional style: appendLink returns a new frozen chain and never changes the old one.
 * Each link stores the previous link's hash, so changing, removing or reordering any
 * entry breaks the chain, and verifyChain names the first broken link.
 * There is deliberately no edit or delete function.
 */
import { createHash } from 'node:crypto'
import type { Entry, EntryRecord } from '../entries'
import { TamperDetected } from '../errors'

export type ChainLink = Readonly<{
  index: number
  prevHash: string
  record: Readonly<EntryRecord>
  hash: string
}>

export const GENESIS_HASH = '0'.repeat(64)

/** JSON with object keys sorted at every level, so equal records give equal text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj)
      .filter((k) => obj[k] !== undefined)
      .sort()
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function linkHash(prevHash: string, record: EntryRecord): string {
  return createHash('sha256').update(prevHash + canonicalJson(record)).digest('hex')
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as object)) deepFreeze(v)
    Object.freeze(value)
  }
  return value
}

/** A new chain with `entry` added at the end. The given chain is not changed. */
export function appendLink(chain: readonly ChainLink[], entry: Entry): readonly ChainLink[] {
  const index = chain.length
  const prevHash = index === 0 ? GENESIS_HASH : chain[index - 1].hash
  const record = deepFreeze(structuredClone(entry.toRecord()))
  const link: ChainLink = deepFreeze({ index, prevHash, record, hash: linkHash(prevHash, record) })
  return Object.freeze([...chain, link])
}

/** Walks the chain from the start; throws TamperDetected at the first broken link. */
export function verifyChain(chain: readonly ChainLink[]): true {
  chain.forEach((link, i) => {
    const expectedPrev = i === 0 ? GENESIS_HASH : chain[i - 1].hash
    let reason = ''
    if (link.index !== i) reason = 'index out of order'
    else if (link.prevHash !== expectedPrev) reason = 'previous hash does not match'
    else if (link.hash !== linkHash(link.prevHash, link.record)) reason = 'entry content changed'
    if (reason) throw new TamperDetected(`broken link at entry #${i} (${link.record.id}): ${reason}`, i)
  })
  return true
}
