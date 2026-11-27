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
  const facts = [
    "entry(e1, date(2021, 3, 14), 'diary')", 'tag(e1, family)', 'mentions(e1, maria)',
    "entry(e2, date(2022, 8, 1), 'diary')", 'tag(e2, family)',
    "entry(e3, date(2023, 2, 10), 'diary')", 'tag(e3, business)',
    'person(maria)', 'protocol(maria)',
    'grant(maria, existence, mentions(maria))',
    'grant(maria, summary, tag(family))',
  ]
  for (const fact of facts) await prolog.assert(fact)

  const yesNo = (b: boolean) => (b ? 'yes' : 'no')
  console.log(`Can Maria see entry e1 (existence)? ${yesNo(await prolog.ask('can_see(maria, existence, e1)'))}`)
  console.log(`Can Maria read summary of e3 (business)? ${yesNo(await prolog.ask('can_see(maria, summary, e3)'))}`)
  console.log(`Entries Maria may summarise: ${(await prolog.all('can_see(maria, summary, E)', 'E')).join(', ')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
