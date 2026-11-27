/*
 * Echo Legacy engine — the small program for ticket 1.04: the main language
 * (TypeScript) loads the Prolog access rules and asks them about Maria.
 * Run: pnpm engine:demo
 * Team: Peter Paul Poloan — Front End, Back End, Q/A, UI/UX Designer, Documentator (one-member group)
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { PrologSession } from './src/prolog/bridge'

async function main(): Promise<void> {
  const rules = readFileSync(path.resolve(__dirname, '../prolog/access_rules.pl'), 'utf8')
  const prolog = await PrologSession.load(rules)

  // Three invented entries and the two grants from the course handout's sample policy.
  await prolog.assert('entry(e1, [family], [maria])')
  await prolog.assert('entry(e2, [family], [])')
  await prolog.assert('entry(e3, [business], [])')
  await prolog.assert('grant(maria, existence, mentions(maria))')
  await prolog.assert('grant(maria, summary, tag(family))')

  const yesNo = (b: boolean) => (b ? 'yes' : 'no')
  console.log(`Can Maria see entry e1 (existence)? ${yesNo(await prolog.ask('can_see(maria, existence, e1)'))}`)
  console.log(`Can Maria read summary of e3 (business)? ${yesNo(await prolog.ask('can_see(maria, summary, e3)'))}`)
  console.log(`Entries Maria may summarise: ${(await prolog.all('can_see(maria, summary, E)', 'E')).join(', ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
