// Echo Legacy engine — append-only hash chain (tickets 2.05, 2.10).
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { describe, expect, it } from 'vitest'
import * as chainModule from '@/engine/src/chain/hash-chain'
import { GENESIS_HASH, appendLink, canonicalJson, linkHash, verifyChain, type ChainLink } from '@/engine/src/chain/hash-chain'
import { DiaryEntry } from '@/engine/src/entries'
import { TamperDetected } from '@/engine/src/errors'

function entry(i: number): DiaryEntry {
  return new DiaryEntry({ id: `e${i}`, date: `2024-01-0${i + 1}`, text: `Entry number ${i}.`, tags: ['family'] })
}

function chainOf(n: number): readonly ChainLink[] {
  let chain: readonly ChainLink[] = []
  for (let i = 0; i < n; i++) chain = appendLink(chain, entry(i))
  return chain
}

/** Expects verifyChain to throw TamperDetected at `index` with a message containing `reason`. */
function expectBroken(chain: readonly ChainLink[], index: number, reason: string) {
  try {
    verifyChain(chain)
  } catch (e) {
    expect(e).toBeInstanceOf(TamperDetected)
    expect((e as TamperDetected).index).toBe(index)
    expect((e as Error).message).toContain(`entry #${index}`)
    expect((e as Error).message).toContain(reason)
    return
  }
  throw new Error('verifyChain did not detect the tampering')
}

/** A copy of a link with some fields replaced (links themselves are frozen). */
function forged(link: ChainLink, change: Partial<ChainLink>): ChainLink {
  return { ...link, ...change }
}

describe('hash chain', () => {
  it('a valid chain verifies', () => {
    expect(verifyChain(chainOf(4))).toBe(true)
  })

  it('verify on an empty chain passes', () => {
    expect(verifyChain([])).toBe(true)
  })

  it('each link stores the hash of the previous one, starting from the genesis hash', () => {
    const chain = chainOf(4)
    expect(chain[0].prevHash).toBe(GENESIS_HASH)
    for (let i = 1; i < chain.length; i++) expect(chain[i].prevHash).toBe(chain[i - 1].hash)
    expect(chain[2].hash).toBe(linkHash(chain[2].prevHash, chain[2].record))
    expect(chain[2].hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('detects a changed entry', () => {
    const chain = [...chainOf(4)]
    chain[2] = forged(chain[2], { record: { ...chain[2].record, text: 'Rewritten.' } })
    expectBroken(chain, 2, 'entry content changed')
  })

  it('detects a removed entry', () => {
    const chain = [...chainOf(4)]
    chain.splice(1, 1)
    expectBroken(chain, 1, 'index out of order')
  })

  it('detects reordered entries', () => {
    const chain = [...chainOf(4)]
    ;[chain[1], chain[2]] = [chain[2], chain[1]]
    expectBroken(chain, 1, 'index out of order')
  })

  it('removing the only entry from a 2-entry chain is detected', () => {
    const chain = [...chainOf(2)]
    chain.splice(0, 1)
    expectBroken(chain, 0, 'index out of order')
  })

  it('a forger who also recomputes the changed hash is caught at the next link', () => {
    const chain = [...chainOf(4)]
    const record = { ...chain[2].record, text: 'Rewritten.' }
    chain[2] = forged(chain[2], { record, hash: linkHash(chain[2].prevHash, record) })
    expectBroken(chain, 3, 'previous hash does not match')
  })

  it('detects a renumbered removal (indexes fixed up after deleting an entry)', () => {
    const chain = [...chainOf(4)]
    chain.splice(1, 1)
    const renumbered = chain.map((l, i) => forged(l, { index: i }))
    expectBroken(renumbered, 1, 'previous hash does not match')
  })

  it('mutating the original object after append does not change the chain', () => {
    const tags = ['family']
    const e = new DiaryEntry({ id: 'm', date: '2024-02-02', text: 'Original.', tags })
    const chain = appendLink([], e)
    tags.push('business')
    expect(chain[0].record.tags).toEqual(['family'])
    expect(verifyChain(chain)).toBe(true)
  })

  it('returns new frozen chains and links; the old chain is untouched', () => {
    const one = chainOf(1)
    const two = appendLink(one, entry(1))
    expect(one).toHaveLength(1)
    expect(two).toHaveLength(2)
    expect(Object.isFrozen(two)).toBe(true)
    expect(Object.isFrozen(two[1])).toBe(true)
    expect(Object.isFrozen(two[1].record)).toBe(true)
    expect(Object.isFrozen(two[1].record.tags)).toBe(true)
  })

  it('offers no way to edit or delete', () => {
    expect(Object.keys(chainModule).filter((k) => /edit|delete|remove|update/i.test(k))).toEqual([])
  })

  it('canonical JSON sorts keys, so the same record always hashes the same', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: 'x' } })).toBe('{"a":{"c":"x","d":[2,1]},"b":1}')
  })
})
