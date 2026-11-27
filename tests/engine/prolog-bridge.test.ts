// Echo Legacy engine — Prolog access rules called from TypeScript (ticket 1.04).
// Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PrologSession } from '@/engine/src/prolog/bridge'

const RULES = readFileSync(path.resolve(__dirname, '../../prolog/access_rules.pl'), 'utf8')

async function mariaSession(): Promise<PrologSession> {
  const s = await PrologSession.load(RULES)
  await s.assert('entry(e1, [family], [maria])')
  await s.assert('entry(e2, [family], [])')
  await s.assert('entry(e3, [business], [])')
  await s.assert('grant(maria, existence, mentions(maria))')
  await s.assert('grant(maria, summary, tag(family))')
  return s
}

describe('Prolog access rules through the bridge', () => {
  it('existence access to an entry that mentions Maria', async () => {
    const s = await mariaSession()
    expect(await s.ask('can_see(maria, existence, e1)')).toBe(true)
  })

  it('summary access to a family entry', async () => {
    const s = await mariaSession()
    expect(await s.ask('can_see(maria, summary, e2)')).toBe(true)
  })

  it('a summary grant does not give the full text', async () => {
    const s = await mariaSession()
    expect(await s.ask('can_see(maria, full, e2)')).toBe(false)
  })

  it('deny by default: no grant for business entries', async () => {
    const s = await mariaSession()
    expect(await s.ask('can_see(maria, summary, e3)')).toBe(false)
    expect(await s.ask('can_see(maria, existence, e3)')).toBe(false)
  })

  it('a person with no grants sees nothing', async () => {
    const s = await mariaSession()
    expect(await s.ask('can_see(nobody, existence, e1)')).toBe(false)
  })

  it('lists every entry a person may summarise', async () => {
    const s = await mariaSession()
    expect(await s.all('can_see(maria, summary, E)', 'E')).toEqual(['e1', 'e2'])
  })

  it('deny beats allow', async () => {
    const s = await mariaSession()
    await s.assert('deny(maria, summary, tag(family))')
    expect(await s.ask('can_see(maria, summary, e2)')).toBe(false)
    expect(await s.all('can_see(maria, summary, E)', 'E')).toEqual([])
  })

  it('a bad goal is reported as an error, not as "no"', async () => {
    const s = await mariaSession()
    await expect(s.ask('can_see(maria,')).rejects.toThrow()
  })
})
