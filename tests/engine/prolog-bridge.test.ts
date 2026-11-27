// Echo Legacy engine — Prolog access rules called from TypeScript (tickets 1.04, 2.06).
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PrologSession } from '@/engine/src/prolog/bridge'

const RULES = readFileSync(path.resolve(__dirname, '../../prolog/access_rules.pl'), 'utf8')

const FACTS = [
  "entry('e1', date(2021, 3, 14), 'diary')", "tag('e1', 'family')", "mentions('e1', 'maria')",
  "entry('e2', date(2022, 8, 1), 'diary')", "tag('e2', 'family')",
  "entry('e3', date(2023, 2, 10), 'diary')", "tag('e3', 'business')",
  "entry('e5', date(2026, 10, 30), 'letter')", "tag('e5', 'family')", "letter('e5', 'To my daughter', 'maria', date(2040, 5, 1))",
  "person('maria')", "protocol('maria')",
  "grant('maria', existence, mentions('maria'))",
  "grant('maria', summary, tag('family'))",
  "person('stranger')",
]

async function session(extra: string[] = []): Promise<PrologSession> {
  const s = await PrologSession.load(RULES)
  for (const f of [...FACTS, ...extra]) await s.assert(f)
  return s
}

describe('Prolog access rules through the bridge', () => {
  it('the rule file loads from the main program', async () => {
    await expect(PrologSession.load(RULES)).resolves.toBeInstanceOf(PrologSession)
  })

  it('existence access to an entry that mentions Maria', async () => {
    expect(await (await session()).ask("can_see('maria', existence, 'e1')")).toBe(true)
  })

  it('summary access to a family entry, and summary also gives existence', async () => {
    const s = await session()
    expect(await s.ask("can_see('maria', summary, 'e2')")).toBe(true)
    expect(await s.ask("can_see('maria', existence, 'e2')")).toBe(true)
  })

  it('the three levels are distinct: a summary grant does not give the full text', async () => {
    expect(await (await session()).ask("can_see('maria', full, 'e2')")).toBe(false)
  })

  it('deny by default: no grant for business entries', async () => {
    const s = await session()
    expect(await s.ask("can_see('maria', existence, 'e3')")).toBe(false)
  })

  it('a person with no protocol is denied everything', async () => {
    const s = await session()
    expect(await s.all("can_see('stranger', _, E)", 'E')).toEqual([])
  })

  it('someone who is not a registered person is denied everything, even with a stray grant', async () => {
    const s = await session(["grant('ghost', full, tag('family'))"])
    expect(await s.all("can_see('ghost', _, E)", 'E')).toEqual([])
  })

  it('lists every entry a person may summarise', async () => {
    expect(await (await session()).all("can_see('maria', summary, E)", 'E')).toEqual(['e1', 'e2', 'e5'])
  })

  it('a letter is never shown in full by these rules (release dates come later)', async () => {
    const s = await session(["grant('maria', full, letter('To my daughter'))"])
    expect(await s.ask("can_see('maria', full, 'e5')")).toBe(false)
    expect(await s.ask("can_see('maria', summary, 'e5')")).toBe(true)
  })

  it('deny beats allow, and a weaker deny blocks stronger levels', async () => {
    const s = await session(["deny('maria', existence, tag('family'))"])
    expect(await s.all("can_see('maria', _, E)", 'E')).toEqual([])
  })

  it('counts what a person may see at a level', async () => {
    expect(await (await session()).all("visible_count('maria', summary, N)", 'N')).toEqual(['3'])
  })

  it('a bad goal is reported as an error, not as "no"', async () => {
    await expect((await session()).ask('can_see(maria,')).rejects.toThrow()
  })
})
