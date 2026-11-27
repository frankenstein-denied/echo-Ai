// Echo Legacy engine — the fictional owner used for testing (ticket 1.07),
// run through the handout's six Maria scenarios at the vault level.
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LetterOfWishes, entryFromRecord, type EntryRecord } from '@/engine/src/entries'
import { AccessDenied } from '@/engine/src/errors'
import { Beneficiary, Grant, Owner, Protocol } from '@/engine/src/model'

type Fixture = {
  owner: { id: string; name: string; fictional: boolean }
  people: { id: string; name: string; relation: string }[]
  entries: EntryRecord[]
}

const fixture: Fixture = JSON.parse(
  readFileSync(path.resolve(__dirname, '../fixtures/ramon-owner.json'), 'utf8'),
)
const entries = fixture.entries.map(entryFromRecord)
const mentionsMaria = entries.filter((e) => /maria/i.test(e.text))
const tagged = (tag: string) => entries.filter((e) => e.tags.includes(tag))

function setUp() {
  const owner = new Owner(fixture.owner.name)
  for (const e of entries) owner.vault.append(e)
  const maria = new Beneficiary('maria', 'Maria Dela Cruz')
  const protocol = new Protocol('maria')
  protocol.addGrant(new Grant('existence', { kind: 'mentions', name: 'maria' }))
  protocol.addGrant(new Grant('summary', { kind: 'tag', tag: 'family' }))
  protocol.addGrant(new Grant('full', { kind: 'letter', title: 'To my daughter' }))
  owner.addBeneficiary(maria)
  owner.assignProtocol(maria, protocol)
  const stranger = new Beneficiary('stranger', 'Someone Else')
  owner.addBeneficiary(stranger)
  owner.freezePolicy() // the death trigger has fired
  return { owner, maria, stranger }
}

describe('fictional owner fixture', () => {
  it('is marked fictional and has 20 dated, tagged entries', () => {
    expect(fixture.owner).toEqual({ id: 'ramon', name: 'Ramon Dela Cruz', fictional: true })
    expect(entries).toHaveLength(20)
    expect(entries.every((e) => e.tags.length > 0)).toBe(true)
    expect(entries[0].date).toBe('2019-03-02')
    expect(entries[19].date).toBe('2026-10-30')
  })

  it('covers family and business topics and mentions Maria often', () => {
    expect(tagged('family').length).toBeGreaterThanOrEqual(5)
    expect(tagged('business').length).toBeGreaterThanOrEqual(4)
    expect(mentionsMaria.length).toBeGreaterThanOrEqual(6)
  })

  it('has exactly one letter to Maria, released on 2040-05-01', () => {
    const letters = entries.filter((e): e is LetterOfWishes => e instanceof LetterOfWishes)
    expect(letters).toHaveLength(1)
    expect([letters[0].title, letters[0].recipient, letters[0].releaseDate]).toEqual(['To my daughter', 'maria', '2040-05-01'])
  })

  it('appends to a vault whose chain verifies', () => {
    expect(setUp().owner.vault.verify()).toBe(true)
  })
})

describe("the handout's Maria scenarios at the vault level", () => {
  it('M1: existence access gives the number of entries about her, not their content', () => {
    const { owner, maria } = setUp()
    const aboutMe = new Grant('existence', { kind: 'mentions', name: 'maria' })
    const visible = owner.vault.entriesFor(maria, 'existence', '2030-01-01')
    expect(visible.filter((e) => aboutMe.matches(e))).toHaveLength(mentionsMaria.length)
  })

  it('M2: summary access returns the family entries, each with its date', () => {
    const { owner, maria } = setUp()
    const summaries = owner.vault.entriesFor(maria, 'summary', '2030-01-01')
    expect(summaries.map((e) => e.id)).toEqual(tagged('family').map((e) => e.id))
    expect(summaries.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.date))).toBe(true)
  })

  it('M3: the letter is refused before 2040-05-01', () => {
    const { owner, maria } = setUp()
    expect(() => owner.vault.read(maria, 'e20', '2040-04-30')).toThrow(AccessDenied)
  })

  it('M4: on 2040-05-01 the letter is shown verbatim', () => {
    const { owner, maria } = setUp()
    const original = fixture.entries.find((r) => r.id === 'e20')!
    expect(owner.vault.read(maria, 'e20', '2040-05-01').text).toBe(original.text)
  })

  it('M5: business entries give the neutral reply and are never in her results', () => {
    const { owner, maria } = setUp()
    const businessOnly = tagged('business').filter((e) => !e.tags.includes('family'))
    for (const e of businessOnly) {
      expect(() => owner.vault.read(maria, e.id, '2041-01-01')).toThrow(new AccessDenied('Nothing to share.'))
    }
    const seen = owner.vault.entriesFor(maria, 'summary', '2041-01-01').map((e) => e.id)
    expect(seen.filter((id) => businessOnly.some((e) => e.id === id))).toEqual([])
  })

  it('M6: a person with no protocol gets nothing', () => {
    const { owner, stranger } = setUp()
    expect(owner.vault.entriesFor(stranger, 'existence', '2041-01-01')).toEqual([])
    expect(() => owner.vault.read(stranger, 'e1', '2041-01-01')).toThrow(new AccessDenied('Nothing to share.'))
  })
})
