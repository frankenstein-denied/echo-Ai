// Echo Legacy engine — Owner, Beneficiary, Vault, Protocol, Grant (ticket 2.02).
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { describe, expect, it } from 'vitest'
import { DiaryEntry, LetterOfWishes } from '@/engine/src/entries'
import { AccessDenied, AmbiguousName, PolicyFrozen } from '@/engine/src/errors'
import { Beneficiary, Grant, Owner, Protocol, Vault } from '@/engine/src/model'

const diary = (id: string, date: string, text: string, tags: string[]) => new DiaryEntry({ id, date, text, tags })

const e1 = diary('e1', '2021-03-14', 'Maria graduated today. So proud.', ['family'])
const e2 = diary('e2', '2022-08-01', 'Sunday lunch with the whole family.', ['family'])
const e3 = diary('e3', '2023-02-10', 'The hardware store had a slow month. Supplier raised prices.', ['business'])
const e4 = diary('e4', '2023-05-05', 'Maria helped at the store; we argued about the prices.', ['family', 'business'])
const letter = new LetterOfWishes({
  id: 'e5',
  date: '2026-10-30',
  text: 'Anak, I am proud of you.',
  tags: ['family'],
  title: 'To my daughter',
  recipient: 'maria',
  releaseDate: '2040-05-01',
})

// The vault serves only beneficiaries its owner registered, so each vault comes with a registered Maria.
let registeredMaria: Beneficiary | null = null

function vaultWithEntries(): Vault {
  const owner = new Owner('Ramon Dela Cruz')
  for (const e of [e1, e2, e3, e4, letter]) owner.vault.append(e)
  registeredMaria = makeMaria()
  owner.addBeneficiary(registeredMaria)
  return owner.vault
}

const maria = (): Beneficiary => registeredMaria ?? makeMaria()

function makeMaria(): Beneficiary {
  const b = new Beneficiary('maria', 'Maria Dela Cruz')
  const p = new Protocol('maria')
  p.addGrant(new Grant('existence', { kind: 'mentions', name: 'maria' }))
  p.addGrant(new Grant('summary', { kind: 'tag', tag: 'family' }))
  p.addGrant(new Grant('full', { kind: 'letter', title: 'To my daughter' }))
  b.assignProtocol(p)
  return b
}

const ids = (entries: readonly { id: string }[]) => entries.map((e) => e.id)

describe('Vault encapsulation', () => {
  it('exposes nothing of its contents from outside', () => {
    const v = vaultWithEntries()
    expect(Object.keys(v)).toEqual([])
    expect(JSON.stringify(v)).toBe('{}')
    expect((v as unknown as { chain?: unknown }).chain).toBeUndefined()
    expect(v.count()).toBe(5)
    expect(v.verify()).toBe(true)
  })

  it('returned entries are frozen copies; mutating them throws and verify() still passes', () => {
    const v = vaultWithEntries()
    const [first] = v.entriesFor(maria(), 'summary', '2030-01-01')
    expect(first).not.toBe(e1)
    expect(Object.isFrozen(first)).toBe(true)
    expect(() => (first.tags as string[]).push('x')).toThrow()
    expect(v.verify()).toBe(true)
  })
})

describe('Protocol and Grant', () => {
  it('a Beneficiary holds a Protocol and a Protocol holds Grants', () => {
    const b = maria()
    expect(b.protocol).toBeInstanceOf(Protocol)
    expect(b.protocol?.grants).toHaveLength(3)
    expect(b.protocol?.grants[0]).toBeInstanceOf(Grant)
  })

  it('a protocol can only be given to its holder', () => {
    expect(() => new Beneficiary('adam_jr', 'Adam Jr.').assignProtocol(new Protocol('maria'))).toThrow()
  })

  it('a grant covers its own level and the levels below it', () => {
    const g = new Grant('summary', { kind: 'tag', tag: 'family' })
    expect(g.covers('existence')).toBe(true)
    expect(g.covers('summary')).toBe(true)
    expect(g.covers('full')).toBe(false)
  })

  it('matches names written with underscores', () => {
    const g = new Grant('existence', { kind: 'mentions', name: 'adam_jr' })
    expect(g.matches(diary('x', '2024-01-01', 'Adam Jr called.', []))).toBe(true)
  })

  it('denies by default', () => {
    const v = vaultWithEntries()
    const stranger = new Beneficiary('lito', 'Lito Santos')
    expect(v.entriesFor(stranger, 'existence', '2041-01-01')).toEqual([])
    expect(() => v.read(stranger, 'e1', '2041-01-01')).toThrow(AccessDenied)
  })

  it('deny beats allow', () => {
    const p = new Protocol('maria')
    p.addGrant(new Grant('summary', { kind: 'tag', tag: 'family' }))
    p.addGrant(new Grant('summary', { kind: 'tag', tag: 'business' }, 'deny'))
    expect(p.decide(e2, 'summary')).toBe('allow')
    expect(p.decide(e4, 'summary')).toBe('deny')
    // A summary deny hides summary and full text, not the fact that the entry exists.
    expect(p.decide(e4, 'existence')).toBe('allow')
  })
})

describe("Maria's protocol from the course handout", () => {
  it('existence access counts the entries that mention her', () => {
    expect(ids(vaultWithEntries().entriesFor(maria(), 'existence', '2030-01-01'))).toEqual(['e1', 'e2', 'e4', 'e5'])
  })

  it('summary access returns the family entries', () => {
    expect(ids(vaultWithEntries().entriesFor(maria(), 'summary', '2030-01-01'))).toEqual(['e1', 'e2', 'e4', 'e5'])
  })

  it('reading a business-only entry is denied with the neutral message', () => {
    const v = vaultWithEntries()
    expect(() => v.read(maria(), 'e3', '2041-01-01')).toThrow(new AccessDenied('Nothing to share.'))
    expect(() => v.read(maria(), 'nope', '2041-01-01')).toThrow(new AccessDenied('Nothing to share.'))
  })

  it('the letter opens for Maria only on or after its release date', () => {
    const v = vaultWithEntries()
    expect(() => v.read(maria(), 'e5', '2040-04-30')).toThrow(AccessDenied)
    expect(v.read(maria(), 'e5', '2040-05-01').text).toBe('Anak, I am proud of you.')
    expect(ids(v.entriesFor(maria(), 'full', '2040-04-30'))).toEqual([])
    expect(ids(v.entriesFor(maria(), 'full', '2040-05-01'))).toEqual(['e5'])
  })
})

describe('Owner', () => {
  it('finds beneficiaries by id or name, case-insensitively', () => {
    const owner = new Owner('Ramon Dela Cruz')
    owner.addBeneficiary(maria())
    expect(owner.findBeneficiary('MARIA').id).toBe('maria')
    expect(owner.findBeneficiary('maria dela cruz').id).toBe('maria')
    expect(() => owner.findBeneficiary('carmen')).toThrow(AccessDenied)
  })

  it('a name that matches two people raises AmbiguousName', () => {
    const owner = new Owner('Ramon Dela Cruz')
    owner.addBeneficiary(new Beneficiary('maria_s', 'Maria'))
    owner.addBeneficiary(new Beneficiary('maria_l', 'maria'))
    expect(() => owner.findBeneficiary('maria')).toThrow(AmbiguousName)
  })

  it('after the policy is frozen, beneficiaries and protocols cannot change', () => {
    const owner = new Owner('Ramon Dela Cruz')
    const b = new Beneficiary('maria', 'Maria')
    owner.addBeneficiary(b)
    owner.freezePolicy()
    expect(owner.isPolicyFrozen).toBe(true)
    expect(() => owner.addBeneficiary(new Beneficiary('lito', 'Lito'))).toThrow(PolicyFrozen)
    expect(() => owner.assignProtocol(b, new Protocol('maria'))).toThrow(PolicyFrozen)
  })

  it('owns a vault that keeps appending and verifying', () => {
    const owner = new Owner('Ramon Dela Cruz')
    for (const e of [e1, e2, e3]) owner.vault.append(e)
    expect(owner.vault.count()).toBe(3)
    expect(owner.vault.verify()).toBe(true)
  })
})
