// Echo Legacy engine — regressions from the final review.
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DiaryEntry, Entry, entryFromRecord } from '@/engine/src/entries'
import { AccessDenied, PolicyFrozen, UnknownEntryType } from '@/engine/src/errors'
import { Beneficiary, Grant, Owner, Protocol, Vault } from '@/engine/src/model'
import { PrologSession } from '@/engine/src/prolog/bridge'

const both = new DiaryEntry({ id: 'h1', date: '2024-01-01', text: 'Clinic visit with the family.', tags: ['family', 'health'] })

describe('a deny also blocks every stronger level', () => {
  it('a weaker deny stops a full allow (TypeScript)', () => {
    const p = new Protocol('maria')
    p.addGrant(new Grant('full', { kind: 'tag', tag: 'family' }))
    p.addGrant(new Grant('existence', { kind: 'tag', tag: 'health' }, 'deny'))
    expect(p.decide(both, 'existence')).toBe('deny')
    expect(p.decide(both, 'summary')).toBe('deny')
    expect(p.decide(both, 'full')).toBe('deny')
  })

  it('a summary deny blocks summary and full but leaves existence', () => {
    const p = new Protocol('maria')
    p.addGrant(new Grant('full', { kind: 'tag', tag: 'family' }))
    p.addGrant(new Grant('summary', { kind: 'tag', tag: 'health' }, 'deny'))
    expect(p.decide(both, 'existence')).toBe('allow')
    expect(p.decide(both, 'summary')).toBe('deny')
    expect(p.decide(both, 'full')).toBe('deny')
  })

  it('a weaker deny stops a full allow (Prolog)', async () => {
    const s = await PrologSession.load(readFileSync(path.resolve(__dirname, '../../prolog/access_rules.pl'), 'utf8'))
    await s.assert('entry(h1, [family, health], [])')
    await s.assert('grant(maria, full, tag(family))')
    await s.assert('deny(maria, existence, tag(health))')
    expect(await s.ask('can_see(maria, full, h1)')).toBe(false)
    expect(await s.ask('can_see(maria, summary, h1)')).toBe(false)
  })
})

describe('the frozen policy really is frozen', () => {
  function frozenOwner() {
    const owner = new Owner('Ramon Dela Cruz')
    const b = new Beneficiary('maria', 'Maria')
    owner.addBeneficiary(b)
    owner.assignProtocol(b, new Protocol('maria'))
    owner.freezePolicy()
    return b
  }

  it('grants cannot be added to a protocol after the freeze', () => {
    const b = frozenOwner()
    expect(() => b.protocol!.addGrant(new Grant('full', { kind: 'tag', tag: 'business' }))).toThrow(PolicyFrozen)
  })

  it('a beneficiary cannot get a new protocol after the freeze', () => {
    const b = frozenOwner()
    expect(() => b.assignProtocol(new Protocol('maria'))).toThrow(PolicyFrozen)
  })
})

describe('the vault only serves beneficiaries its owner registered', () => {
  it('a forged beneficiary with its own protocol gets nothing', () => {
    const owner = new Owner('Ramon Dela Cruz')
    owner.vault.append(both)
    const forged = new Beneficiary('x', 'x')
    const p = new Protocol('x')
    p.addGrant(new Grant('full', { kind: 'tag', tag: 'family' }))
    forged.assignProtocol(p)
    expect(owner.vault.entriesFor(forged, 'full', '2041-01-01')).toEqual([])
    expect(() => owner.vault.read(forged, 'h1', '2041-01-01')).toThrow(new AccessDenied('Nothing to share.'))
  })

  it('a vault serves one owner only', () => {
    const vault = new Vault()
    new Owner('Ramon Dela Cruz', vault)
    expect(() => new Owner('Someone Else', vault)).toThrow()
  })
})

describe('mentions match whole names only', () => {
  const g = new Grant('existence', { kind: 'mentions', name: 'maria' })
  const say = (text: string) => new DiaryEntry({ id: 'm', date: '2024-01-01', text, tags: [] })

  it('does not match a longer name that starts the same', () => {
    expect(g.matches(say('Paid Mariano for the shipment.'))).toBe(false)
  })

  it('still matches the name, a possessive, and an NFD spelling', () => {
    expect(g.matches(say('Maria came home.'))).toBe(true)
    expect(g.matches(say("We visited Maria's house."))).toBe(true)
    const nino = new Grant('existence', { kind: 'mentions', name: 'Niño' })
    expect(nino.matches(say('Niño laughed.'))).toBe(true)
  })
})

describe('the vault refuses entry types it cannot read back', () => {
  class Photo extends Entry {
    get kind() {
      return 'photo'
    }
    describe() {
      return 'A photo'
    }
  }

  it('append rejects an unknown entry type with a typed error, and reads keep working', () => {
    const owner = new Owner('Ramon Dela Cruz')
    const maria = new Beneficiary('maria', 'Maria')
    owner.addBeneficiary(maria)
    const p = new Protocol('maria')
    p.addGrant(new Grant('summary', { kind: 'tag', tag: 'family' }))
    owner.assignProtocol(maria, p)
    owner.vault.append(both)
    expect(() => owner.vault.append(new Photo({ id: 'p1', date: '2024-01-02', text: 'x', tags: ['family'] }))).toThrow(UnknownEntryType)
    expect(owner.vault.count()).toBe(1)
    expect(owner.vault.entriesFor(maria, 'summary', '2041-01-01')).toHaveLength(1)
  })

  it('entryFromRecord raises the typed error too', () => {
    expect(() => entryFromRecord({ kind: 'photo', id: 'p', date: '2024-01-01', text: '', tags: [] })).toThrow(UnknownEntryType)
  })
})
