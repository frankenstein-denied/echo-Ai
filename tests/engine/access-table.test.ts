// Echo Legacy engine — the access test table run through the Prolog rules (ticket 2.06).
// Rows come from project-docs/05-access-test-table.csv; the fictional owner from tests/fixtures.
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { DiaryEntry, entryFromRecord, type EntryRecord } from '@/engine/src/entries'
import { Grant } from '@/engine/src/model'
import { PrologSession } from '@/engine/src/prolog/bridge'
import { entryFacts, personFacts } from '@/engine/src/prolog/facts'

const root = path.resolve(__dirname, '../..')
const fixture: { entries: EntryRecord[] } = JSON.parse(readFileSync(path.join(root, 'tests/fixtures/ramon-owner.json'), 'utf8'))
const csvIds = readFileSync(path.join(root, 'project-docs/05-access-test-table.csv'), 'utf8')
  .split(/\r?\n/)
  .slice(1)
  .filter(Boolean)
  .map((line) => line.split(',')[0])

const entries = [
  ...fixture.entries.map(entryFromRecord),
  // A1 needs an entry tagged both family and health (the fixture has none).
  new DiaryEntry({ id: 'x1', date: '2025-01-15', text: 'Clinic visit; the family came along.', tags: ['family', 'health'] }),
]
const PEOPLE = ['maria', 'adam_jr', 'lito', 'carmen']

// The policies the table's rows are written against: the handout's sample for Maria (plus the
// health denial from sample 2), sample 2 for Adam Jr., sample 3 for Lito, and a stranger with no protocol.
const policies: [string, Grant[] | null][] = [
  ['maria', [
    new Grant('existence', { kind: 'mentions', name: 'maria' }),
    new Grant('summary', { kind: 'tag', tag: 'family' }),
    new Grant('summary', { kind: 'tag', tag: 'health' }, 'deny'),
  ]],
  ['adam_jr', [new Grant('existence', { kind: 'mentions', name: 'adam_jr' })]],
  ['lito', [new Grant('existence', { kind: 'tag', tag: 'business' })]],
  ['stranger', null],
]

let prolog: PrologSession
const ids = (goal: string) => prolog.all(goal, 'E')
const sorted = (xs: string[]) => [...xs].sort()
const idsWhere = (pred: (e: (typeof entries)[number]) => boolean) => sorted(entries.filter(pred).map((e) => e.id))

beforeAll(async () => {
  prolog = await PrologSession.load(readFileSync(path.join(root, 'prolog/access_rules.pl'), 'utf8'))
  for (const f of entryFacts(entries, PEOPLE)) await prolog.assert(f)
  for (const [id, grants] of policies) for (const f of personFacts(id, grants)) await prolog.assert(f)
})

const rows: Record<string, () => Promise<void>> = {
  async M1() {
    const aboutMe = await ids("(mentions(E, 'maria'), can_see('maria', existence, E))")
    expect(sorted(aboutMe)).toEqual(['e1', 'e11', 'e13', 'e16', 'e19', 'e5', 'e8'])
    expect(await ids("(mentions(E, 'maria'), can_see('maria', full, E))")).toEqual([])
  },
  async M2() {
    const familyOnly = idsWhere((e) => e.tags.includes('family') && !e.tags.includes('health'))
    expect(sorted(await ids("can_see('maria', summary, E)"))).toEqual(familyOnly)
    expect(await ids("can_see('maria', full, E)")).toEqual([])
  },
  async M5() {
    const businessOnly = idsWhere((e) => e.tags.includes('business') && !e.tags.includes('family'))
    expect(businessOnly.length).toBe(7)
    const seen = await ids("can_see('maria', _, E)")
    expect(seen.filter((id) => businessOnly.includes(id))).toEqual([])
  },
  async M6() {
    expect(await ids("can_see('stranger', _, E)")).toEqual([])
  },
  async A1() {
    expect(await prolog.ask("can_see('maria', summary, 'x1')")).toBe(false)
    expect(await prolog.ask("can_see('maria', full, 'x1')")).toBe(false)
  },
  async A3() {
    expect(await prolog.ask("can_see('adam_jr', _, 'e20')")).toBe(false)
  },
  async A4() {
    const businessIds = idsWhere((e) => e.tags.includes('business'))
    expect(sorted(await ids("can_see('lito', existence, E)"))).toEqual(businessIds)
    expect(await ids("can_see('lito', summary, E)")).toEqual([])
  },
}

const LATER: Record<string, string> = {
  M3: 'needs the release-date rule (later ticket)',
  M4: 'needs the release-date rule (later ticket)',
  A2: 'needs the death-trigger rule (later ticket)',
  A5: 'needs the AI Q&A script (later ticket)',
}

describe('access test table (project-docs/05-access-test-table.csv) through Prolog', () => {
  it('every row in the table is either run here or listed as later', () => {
    for (const id of csvIds) expect(id in rows || id in LATER, `row ${id}`).toBe(true)
  })

  it('at least five rows are run', () => {
    expect(Object.keys(rows).filter((id) => csvIds.includes(id)).length).toBeGreaterThanOrEqual(5)
  })

  for (const [id, check] of Object.entries(rows)) it(`row ${id}`, check)
  for (const [id, why] of Object.entries(LATER)) it.todo(`row ${id}: ${why}`)
})
